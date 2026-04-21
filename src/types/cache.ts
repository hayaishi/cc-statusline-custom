/**
 * Type definitions for cache entries.
 *
 * These types define generic cache storage structures.
 */

import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * Default cache directory path.
 */
export const DEFAULT_CACHE_DIR = join(homedir(), '.cache', 'cc-statusline-custom');

/**
 * Default cache TTL in seconds.
 */
export const DEFAULT_CACHE_TTL_SECONDS = 60;

/**
 * Maximum cache file size in bytes (2KB).
 * Files larger than this are treated as invalid.
 */
export const MAX_CACHE_FILE_SIZE_BYTES = 2048;

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
 * subscriptionUsage is retained for backward compat (stale files in user caches
 * are harmless; no production code writes to it anymore).
 */
export const CACHE_FILE_NAMES: {
  lock: string;
  subscriptionUsage: string;
  [key: string]: string;
} = {
  lock: 'cache.lock',
  subscriptionUsage: 'subscription-usage.json',
};

/**
 * Cache key type.
 */
export type CacheKey = string;

/**
 * Union of all cache entry types.
 */
export interface CacheEntry {
  [key: string]: unknown;
  lastAttemptAt?: string;
}
