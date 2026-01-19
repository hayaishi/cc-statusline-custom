/**
 * Type definitions for cache entries.
 *
 * These types define the structure of cached extended metrics.
 */

import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * Default cache directory path.
 */
export const DEFAULT_CACHE_DIR = join(homedir(), '.cache', 'ccusage-statusline');

/**
 * Default cache TTL in seconds.
 */
export const DEFAULT_CACHE_TTL_SECONDS = 60;

/**
 * Maximum cache file size in bytes (1KB).
 * Files larger than this are treated as invalid.
 */
export const MAX_CACHE_FILE_SIZE_BYTES = 1024;

/**
 * Lock file stale threshold in seconds.
 * Lock files older than this are ignored.
 */
export const LOCK_FILE_STALE_THRESHOLD_SECONDS = 60;

/**
 * Lock file active threshold in seconds.
 * Skip cache read if lock file is newer than this.
 */
export const LOCK_FILE_ACTIVE_THRESHOLD_SECONDS = 5;

/**
 * Cache file names.
 */
export const CACHE_FILE_NAMES = {
  dailyTotal: 'daily-total.json',
  blockInfo: 'block-info.json',
  burnRate: 'burn-rate.json',
  lock: 'cache.lock',
} as const;

/**
 * Cache key type.
 */
export type CacheKey = 'dailyTotal' | 'blockInfo' | 'burnRate';

/**
 * Base cache entry with common metadata.
 */
export interface CacheEntryBase {
  readonly updated_at: number; // Unix timestamp in milliseconds
}

/**
 * Daily total cost cache entry.
 */
export interface DailyTotalEntry extends CacheEntryBase {
  readonly cost_usd: number;
  readonly date: string; // YYYY-MM-DD format
}

/**
 * Block info cache entry.
 */
export interface BlockInfoEntry extends CacheEntryBase {
  readonly cost_usd: number;
  readonly remaining_seconds: number;
}

/**
 * Burn rate cache entry.
 */
export interface BurnRateEntry extends CacheEntryBase {
  readonly rate_per_hour: number;
}

/**
 * Union of all cache entry types.
 */
export type CacheEntry = DailyTotalEntry | BlockInfoEntry | BurnRateEntry;

/**
 * Map of cache keys to their entry types.
 */
export interface CacheEntryMap {
  dailyTotal: DailyTotalEntry;
  blockInfo: BlockInfoEntry;
  burnRate: BurnRateEntry;
}
