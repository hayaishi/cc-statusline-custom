/**
 * Type definitions for cache entries.
 *
 * These types define the structure of cached subscription usage metrics.
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
  subscriptionUsage: 'subscription-usage.json',
  lock: 'cache.lock',
} as const;

/**
 * Cache key type.
 */
export type CacheKey = 'subscriptionUsage';

/**
 * Subscription usage cache entry.
 */
export interface SubscriptionUsageEntry {
  readonly utilizationPercent?: number;
  readonly resetsAt?: string;
  readonly lastError: string | null;
  readonly lastErrorDetail?: string | null;
  readonly lastAttemptAt?: string;
  readonly updatedAt?: string;
  readonly window?: 'five_hour' | 'seven_day';
  readonly fiveHour?: {
    readonly utilizationPercent: number;
    readonly resetsAt: string;
  };
  readonly sevenDay?: {
    readonly utilizationPercent: number;
    readonly resetsAt: string;
  };
}

/**
 * Union of all cache entry types.
 */
export type CacheEntry = SubscriptionUsageEntry;

/**
 * Map of cache keys to their entry types.
 */
export interface CacheEntryMap {
  subscriptionUsage: SubscriptionUsageEntry;
}
