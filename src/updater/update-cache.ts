/**
 * Cache updater for OAuth subscription usage.
 *
 * This module runs out-of-band from the statusline hot path.
 */

import {
  getCacheDir,
  getDebugLogMaxBytes,
  getDebugLogMaxFiles,
  getDebugLogPath,
  getSubscriptionCacheTtl,
} from '../config/env.js';
import { writeCacheAtomic, acquireLock, releaseLock } from '../core/cache.js';
import type { SubscriptionUsageEntry } from '../types/cache.js';
import type { DebugLogOptions } from '../utils/debug-log.js';
import { fetchOAuthUsage, type FetchOAuthUsageOptions, type OAuthUsage } from './oauth.js';
import { getOAuthToken } from './token.js';
import { readCacheSyncWithMtime } from '../core/cache-reader.js';

/**
 * Result of a cache update operation.
 */
export interface UpdateCacheResult {
  success: boolean;
  message: string;
}

/**
/**
 * Options for cache update operation.
 */
export interface UpdateCacheOptions {
  mode?: 'auto' | 'force';
  debug?: boolean;
  ccVersion?: string;
}

interface UpdaterDeps {
  getOAuthToken: () => string | null;
  fetchOAuthUsage: (token: string, options?: FetchOAuthUsageOptions) => Promise<OAuthUsage>;
}

const MAX_OAUTH_ERROR_DETAIL_LENGTH = 2000;

function getUpdaterOverrides(): Partial<UpdaterDeps> {
  const isTest = process.env.VITEST === 'true' || process.env.NODE_ENV === 'test';
  if (!isTest) {
    return {};
  }

  const globalValue = (globalThis as { __ccUpdaterDeps?: unknown }).__ccUpdaterDeps;
  if (typeof globalValue !== 'object' || globalValue === null) {
    return {};
  }

  const record = globalValue as Record<string, unknown>;
  const overrides: Partial<UpdaterDeps> = {};

  if (typeof record.getOAuthToken === 'function') {
    overrides.getOAuthToken = record.getOAuthToken as UpdaterDeps['getOAuthToken'];
  }

  if (typeof record.fetchOAuthUsage === 'function') {
    overrides.fetchOAuthUsage = record.fetchOAuthUsage as UpdaterDeps['fetchOAuthUsage'];
  }

  return overrides;
}

function resolveUpdaterDeps(): UpdaterDeps {
  const overrides = getUpdaterOverrides();
  return {
    getOAuthToken: overrides.getOAuthToken ?? getOAuthToken,
    fetchOAuthUsage: overrides.fetchOAuthUsage ?? fetchOAuthUsage,
  };
}

function normalizeOAuthErrorDetail(detail: string): string {
  const trimmed = detail.trim();
  return trimmed.length <= MAX_OAUTH_ERROR_DETAIL_LENGTH
    ? trimmed
    : trimmed.slice(0, MAX_OAUTH_ERROR_DETAIL_LENGTH);
}

function extractOAuthErrorDetail(error: unknown): string | null {
  const record = error as { responseBody?: unknown; body?: unknown };

  let detail: string | null = null;
  if (typeof record.responseBody === 'string') {
    detail = record.responseBody;
  } else if (typeof record.body === 'string') {
    detail = record.body;
  }

  if (detail === null || detail.trim() === '') {
    return null;
  }

  return normalizeOAuthErrorDetail(detail.trim());
}

function normalizeOAuthFetchError(error: unknown): string {
  if (error instanceof Error) {
    const message = error.message.trim();
    if (message.startsWith('oauth_status_')) {
      return message;
    }
    if (message === 'oauth_response_invalid') {
      return message;
    }
  }

  const code = (error as { code?: unknown }).code;
  if (typeof code === 'string' && code.trim() !== '') {
    return `oauth_network_${code.trim()}`;
  }

  return 'oauth_fetch_failed';
}

function buildDebugLogOptions(): DebugLogOptions {
  return {
    enabled: true,
    filePath: getDebugLogPath(),
    maxBytes: getDebugLogMaxBytes(),
    maxFiles: getDebugLogMaxFiles(),
  };
}

function buildFetchOAuthUsageOptions(debug: boolean, version?: string): FetchOAuthUsageOptions | undefined {
  if (!debug && version === undefined) {
    return undefined;
  }

  return {
    ...(version !== undefined && { version }),
    ...(debug && { debugLogOptions: buildDebugLogOptions() }),
  };
}

async function buildSubscriptionUsageEntry(debug: boolean, ccVersion?: string): Promise<SubscriptionUsageEntry> {
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const base: SubscriptionUsageEntry = {
    updatedAt: nowIso,
    lastAttemptAt: nowIso,
    lastError: null,
  };

  const { getOAuthToken: readToken, fetchOAuthUsage: fetchUsage } = resolveUpdaterDeps();
  const token = readToken();
  if (token === null) {
    return { ...base, lastError: 'token_missing' };
  }

  let usage: OAuthUsage;
  try {
    usage = await fetchUsage(token, buildFetchOAuthUsageOptions(debug, ccVersion));
  } catch (error) {
    const normalizedError = normalizeOAuthFetchError(error);
    const detail = debug ? extractOAuthErrorDetail(error) : null;

    return {
      ...base,
      lastError: normalizedError,
      ...(detail !== null && { lastErrorDetail: detail }),
    };
  }

  // Determine which window to use.
  // Note: When seven_day utilization hits 100%, the API can omit five_hour entirely.
  // Priority: 7-day window if utilization is 100% or more (when both exist)
  // Otherwise: 5-hour window (default), or 7-day when 5-hour is missing
  const { fiveHours, sevenDays } = usage;
  const hasFiveHours = fiveHours !== undefined;
  const hasSevenDays = sevenDays !== undefined;

  if (!hasFiveHours && !hasSevenDays) {
    return { ...base, lastError: 'oauth_response_invalid' };
  }

  const fiveHoursData = fiveHours ?? { utilization: Number.NaN, resetsAt: '' };
  const sevenDaysData = sevenDays ?? { utilization: Number.NaN, resetsAt: '' };

  let selectedWindow = hasFiveHours ? fiveHoursData : sevenDaysData;
  let windowType: 'five_hours' | 'seven_days' = hasFiveHours ? 'five_hours' : 'seven_days';

  if (hasFiveHours && hasSevenDays) {
    const sevenDaysPercent = normalizeUtilizationPercent(sevenDaysData.utilization);
    if (sevenDaysPercent !== null && sevenDaysPercent >= 100) {
      selectedWindow = sevenDaysData;
      windowType = 'seven_days';
    }
  }

  const normalized = normalizeUtilizationPercent(selectedWindow.utilization);
  if (normalized === null) {
    return { ...base, lastError: 'utilization_invalid' };
  }

  if (!Number.isFinite(Date.parse(selectedWindow.resetsAt))) {
    return { ...base, lastError: 'resets_at_invalid' };
  }

  // Populate detailed window data
  const fiveHoursPercent = normalizeUtilizationPercent(fiveHoursData.utilization);
  const fiveHoursEntry = hasFiveHours && fiveHoursPercent !== null
    ? { utilizationPercent: fiveHoursPercent, resetsAt: fiveHoursData.resetsAt }
    : undefined;

  const sevenDaysPercent = hasSevenDays
    ? normalizeUtilizationPercent(sevenDaysData.utilization)
    : null;
  const sevenDaysEntry = sevenDaysPercent !== null
    ? { utilizationPercent: sevenDaysPercent, resetsAt: sevenDaysData.resetsAt }
    : undefined;

  // Populate extra usage data (store float utilization for decimal precision)
  const extraUsageEntry = usage.extraUsage !== undefined
    ? {
        isEnabled: usage.extraUsage.isEnabled,
        usedCredits: usage.extraUsage.usedCredits,
        utilizationPercent: usage.extraUsage.utilization,
      }
    : undefined;

  return {
    ...base,
    utilizationPercent: normalized,
    resetsAt: selectedWindow.resetsAt,
    lastError: null,
    window: windowType,
    ...(fiveHoursEntry ? { fiveHours: fiveHoursEntry } : {}),
    ...(sevenDaysEntry ? { sevenDays: sevenDaysEntry } : {}),
    ...(extraUsageEntry ? { extraUsage: extraUsageEntry } : {}),
  };
}

export function normalizeUtilizationPercent(raw: number): number | null {
  if (!Number.isFinite(raw)) {
    return null;
  }
  const rounded = Math.round(raw);
  return Math.max(0, Math.min(100, rounded));
}

/**
 * Validates whether a subscription usage entry has valid, usable data.
 * This is a minimal, updater-local validation (no cross-layer coupling).
 */
function isValidSubscriptionUsage(entry: SubscriptionUsageEntry): boolean {
  // Must have no error
  if (entry.lastError !== null) {
    return false;
  }

  // Must have utilizationPercent in valid range
  if (typeof entry.utilizationPercent !== 'number' ||
      entry.utilizationPercent < 0 ||
      entry.utilizationPercent > 100) {
    return false;
  }

  // Must have parseable resetsAt
  if (typeof entry.resetsAt !== 'string' ||
      !Number.isFinite(Date.parse(entry.resetsAt))) {
    return false;
  }

  return true;
}

/**
 * Updates all cache files atomically.
 *
 * @param cacheDir - Cache directory (optional, uses env config default)
 * @param options - Update options (mode: 'auto' or 'force')
 * @returns Result indicating success/failure and a message
 */
export async function updateCache(
  cacheDir?: string,
  options?: UpdateCacheOptions
): Promise<UpdateCacheResult> {
  const dir = cacheDir ?? getCacheDir();
  const mode = options?.mode ?? 'force';
  const debug = options?.debug ?? false;

  // In auto mode, check if cache is fresh and usable BEFORE acquiring lock
  // (acquireLock creates a lock file that causes readCacheSyncWithMtime to skip)
  if (mode === 'auto') {
    const ttl = getSubscriptionCacheTtl();
    const existing = readCacheSyncWithMtime('subscriptionUsage', dir, ttl);
    if (existing.isFresh && existing.entry !== null) {
      if (isValidSubscriptionUsage(existing.entry)) {
        return { success: true, message: 'Cache fresh; skipped' };
      }
    }
  }

  if (!acquireLock(dir)) {
    return {
      success: false,
      message: 'Cannot update cache: lock is held by another process',
    };
  }

  try {
    // Proceed with network fetch (force mode or auto mode with stale/invalid cache)
    const subscriptionUsage = await buildSubscriptionUsageEntry(debug, options?.ccVersion);

    writeCacheAtomic('subscriptionUsage', subscriptionUsage, dir);

    return {
      success: true,
      message: 'Cache updated successfully',
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      message: `Cache update failed: ${errorMessage}`,
    };
  } finally {
    releaseLock(dir);
  }
}
