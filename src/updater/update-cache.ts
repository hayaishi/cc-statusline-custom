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

  let usage;
  try {
    usage = await fetchUsage(token);
  } catch {
    return { ...base, lastError: 'oauth_fetch_failed' };
  }

  const normalized = normalizeUtilizationPercent(usage.utilization);
  if (normalized === null) {
    return { ...base, lastError: 'utilization_invalid' };
  }

  if (!Number.isFinite(Date.parse(usage.resetsAt))) {
    return { ...base, lastError: 'resets_at_invalid' };
  }

  return {
    ...base,
    utilizationPercent: normalized,
    resetsAt: usage.resetsAt,
    lastError: null,
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
