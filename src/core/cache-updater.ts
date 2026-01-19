/**
 * Cache updater for extended metrics.
 *
 * This module provides the cache update functionality used by the --update-cache
 * subcommand. It computes daily-total, block-info, and burn-rate using offline/local
 * sources only (no network calls).
 *
 * The updater runs out-of-band from the statusline hot path.
 */

import { getCacheDir } from '../config/env.js';
import { writeCacheAtomic, acquireLock, releaseLock } from './cache.js';
import type { DailyTotalEntry, BlockInfoEntry, BurnRateEntry } from '../types/cache.js';

/**
 * Result of a cache update operation.
 */
export interface UpdateCacheResult {
  success: boolean;
  message: string;
}

/**
 * Gets today's date in YYYY-MM-DD format.
 */
function getTodayDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${String(year)}-${month}-${day}`;
}

/**
 * Computes the daily total cost.
 *
 * In a full implementation, this would read from local session data or ccusage cache.
 * For now, returns a placeholder value.
 */
function computeDailyTotal(): DailyTotalEntry {
  // TODO: Integrate with local ccusage data or session tracking
  // For now, return placeholder values
  return {
    cost_usd: 0,
    date: getTodayDate(),
    updated_at: Date.now(),
  };
}

/**
 * Computes block info (cost and remaining time).
 *
 * In a full implementation, this would calculate based on block start time
 * and accumulated costs. For now, returns placeholder values.
 */
function computeBlockInfo(): BlockInfoEntry {
  // TODO: Integrate with block tracking
  // 5-hour blocks, track start time and remaining
  return {
    cost_usd: 0,
    remaining_seconds: 18000, // 5 hours in seconds (placeholder)
    updated_at: Date.now(),
  };
}

/**
 * Computes burn rate (cost per hour).
 *
 * In a full implementation, this would calculate based on recent
 * spending patterns. For now, returns placeholder value.
 */
function computeBurnRate(): BurnRateEntry {
  // TODO: Integrate with spending tracking
  return {
    rate_per_hour: 0,
    updated_at: Date.now(),
  };
}

/**
 * Updates all cache files atomically.
 *
 * @param cacheDir - Cache directory (optional, uses env config default)
 * @returns Result indicating success/failure and a message
 */
export function updateCache(cacheDir?: string): UpdateCacheResult {
  const dir = cacheDir ?? getCacheDir();

  // Try to acquire lock
  if (!acquireLock(dir)) {
    return {
      success: false,
      message: 'Cannot update cache: lock is held by another process',
    };
  }

  try {
    // Compute all metrics
    const dailyTotal = computeDailyTotal();
    const blockInfo = computeBlockInfo();
    const burnRate = computeBurnRate();

    // Write cache files atomically
    writeCacheAtomic('dailyTotal', dailyTotal, dir);
    writeCacheAtomic('blockInfo', blockInfo, dir);
    writeCacheAtomic('burnRate', burnRate, dir);

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
    // Always release lock
    releaseLock(dir);
  }
}
