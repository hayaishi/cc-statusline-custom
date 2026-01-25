/**
 * Cache updater for OAuth subscription usage.
 *
 * This module runs out-of-band from the statusline hot path.
 */

import { getCacheDir } from '../config/env.js';
import { writeCacheAtomic, acquireLock, releaseLock } from '../core/cache.js';
import type { SubscriptionUsageEntry } from '../types/cache.js';
import { fetchOAuthUsage, type OAuthUsage } from './oauth.js';
import { getOAuthToken } from './token.js';

/**
 * Result of a cache update operation.
 */
export interface UpdateCacheResult {
  success: boolean;
  message: string;
}

interface UpdaterDeps {
  getOAuthToken: () => string | null;
  fetchOAuthUsage: (token: string) => Promise<OAuthUsage>;
}

function getUpdaterOverrides(): Partial<UpdaterDeps> {
  const isTest = process.env.VITEST === 'true' || process.env.NODE_ENV === 'test';
  if (!isTest) {
    return {};
  }

  const globalValue = (globalThis as { __ccusageUpdaterDeps?: unknown }).__ccusageUpdaterDeps;
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

async function buildSubscriptionUsageEntry(): Promise<SubscriptionUsageEntry> {
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
    usage = await fetchUsage(token);
  } catch {
    return { ...base, lastError: 'oauth_fetch_failed' };
  }

  // Determine which window to use
  // Priority: 7-day window if utilization is 100% or more
  // Otherwise: 5-hour window (default)
  let selectedWindow = usage.fiveHour;
  let windowType: 'five_hour' | 'seven_day' = 'five_hour';

  const sevenDayPercent = usage.sevenDay
    ? normalizeUtilizationPercent(usage.sevenDay.utilization)
    : null;
  if (usage.sevenDay && sevenDayPercent !== null && sevenDayPercent >= 100) {
    selectedWindow = usage.sevenDay;
    windowType = 'seven_day';
  }

  const normalized = normalizeUtilizationPercent(selectedWindow.utilization);
  if (normalized === null) {
    return { ...base, lastError: 'utilization_invalid' };
  }

  if (!Number.isFinite(Date.parse(selectedWindow.resetsAt))) {
    return { ...base, lastError: 'resets_at_invalid' };
  }

  // Populate detailed window data
  const fiveHourPercent = normalizeUtilizationPercent(usage.fiveHour.utilization);
  const fiveHourEntry =
    fiveHourPercent !== null
      ? {
          utilizationPercent: fiveHourPercent,
          resetsAt: usage.fiveHour.resetsAt,
        }
      : undefined;

  let sevenDayEntry: { utilizationPercent: number; resetsAt: string } | undefined;
  if (usage.sevenDay) {
    const sevenDayPercent = normalizeUtilizationPercent(usage.sevenDay.utilization);
    if (sevenDayPercent !== null) {
      sevenDayEntry = {
        utilizationPercent: sevenDayPercent,
        resetsAt: usage.sevenDay.resetsAt,
      };
    }
  }

  return {
    ...base,
    utilizationPercent: normalized,
    resetsAt: selectedWindow.resetsAt,
    lastError: null,
    window: windowType,
    ...(fiveHourEntry ? { fiveHour: fiveHourEntry } : {}),
    ...(sevenDayEntry ? { sevenDay: sevenDayEntry } : {}),
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
 * Updates all cache files atomically.
 *
 * @param cacheDir - Cache directory (optional, uses env config default)
 * @returns Result indicating success/failure and a message
 */
export async function updateCache(cacheDir?: string): Promise<UpdateCacheResult> {
  const dir = cacheDir ?? getCacheDir();

  if (!acquireLock(dir)) {
    return {
      success: false,
      message: 'Cannot update cache: lock is held by another process',
    };
  }

  try {
    const subscriptionUsage = await buildSubscriptionUsageEntry();

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
