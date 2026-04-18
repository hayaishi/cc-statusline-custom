/**
 * Read-only cache reader for the statusline hot path.
 *
 * This module provides synchronous cache reading with safety guarantees:
 * - Returns null on any error (file missing, parse error, etc.)
 * - Skips read if lock file is fresh (< 5 seconds old)
 * - Enforces max file size to prevent memory issues
 * - Never throws
 */

import { readFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  CACHE_FILE_NAMES,
  MAX_CACHE_FILE_SIZE_BYTES,
  LOCK_FILE_ACTIVE_THRESHOLD_SECONDS,
  DEFAULT_CACHE_DIR,
  DEFAULT_CACHE_TTL_SECONDS,
} from '../types/cache.js';
import type { CacheKey, CacheEntry } from '../types/cache.js';

/**
 * Checks if the lock file is fresh (< threshold seconds old).
 *
 * Used to detect when another update is already in progress.
 *
 * @param cacheDir - Cache directory path
 * @returns true if lock file exists and is fresh
 */
export function isLockFileFresh(cacheDir: string): boolean {
  try {
    const lockPath = join(cacheDir, CACHE_FILE_NAMES.lock);
    if (!existsSync(lockPath)) {
      return false;
    }

    const stat = statSync(lockPath);
    const ageSeconds = (Date.now() - stat.mtimeMs) / 1000;
    return ageSeconds < LOCK_FILE_ACTIVE_THRESHOLD_SECONDS;
  } catch {
    // If we can't check the lock file, assume it's not fresh
    return false;
  }
}

/**
 * Gets the file path for a cache key.
 */
function getCacheFilePath(key: CacheKey, cacheDir: string): string {
  const fileName = CACHE_FILE_NAMES[key];
  if (fileName === undefined) {
    return '';
  }
  return join(cacheDir, fileName);
}

/**
 * Reads a cache entry synchronously.
 *
 * @param key - Cache key
 * @param cacheDir - Cache directory path (optional, defaults to ~/.cache/cc-statusline-custom)
 * @param ttlSeconds - TTL in seconds (optional, defaults to 60)
 * @returns The cached entry or null if unavailable/invalid/stale
 */
export function readCacheSync(
  key: CacheKey,
  cacheDir: string = DEFAULT_CACHE_DIR,
  ttlSeconds: number = DEFAULT_CACHE_TTL_SECONDS
): CacheEntry | null {
  try {
    // Skip if lock file is fresh (write in progress)
    if (isLockFileFresh(cacheDir)) {
      return null;
    }

    const filePath = getCacheFilePath(key, cacheDir);
    if (filePath === '') {
      return null;
    }

    // Check file exists and size
    if (!existsSync(filePath)) {
      return null;
    }

    const stat = statSync(filePath);
    if (stat.size > MAX_CACHE_FILE_SIZE_BYTES) {
      return null;
    }

    // Check mtime-based TTL
    const ageSeconds = (Date.now() - stat.mtimeMs) / 1000;
    if (ageSeconds >= ttlSeconds) {
      return null;
    }

    // Read and parse
    const content = readFileSync(filePath, 'utf-8');
    if (content.trim() === '') {
      return null;
    }

    const parsed: unknown = JSON.parse(content);

    // Validate it's an object
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return null;
    }

    return parsed as CacheEntry;
  } catch {
    // Never throw - return null on any error
    return null;
  }
}

/**
 * Read result that includes freshness from mtime-based TTL.
 */
export interface CacheReadWithMtime {
  entry: CacheEntry | null;
  isFresh: boolean;
}

/**
 * Reads a cache entry synchronously, returning freshness via mtime-based TTL.
 * Unlike readCacheSync, stale entries are returned with isFresh=false.
 *
 * @param key - Cache key
 * @param cacheDir - Cache directory path (optional, defaults to ~/.cache/cc-statusline-custom)
 * @param ttlSeconds - TTL in seconds (optional, defaults to 60)
 * @returns Entry with freshness flag
 */
export function readCacheSyncWithMtime(
  key: CacheKey,
  cacheDir: string = DEFAULT_CACHE_DIR,
  ttlSeconds: number = DEFAULT_CACHE_TTL_SECONDS
): CacheReadWithMtime {
  try {
    if (isLockFileFresh(cacheDir)) {
      return { entry: null, isFresh: false };
    }

    const filePath = getCacheFilePath(key, cacheDir);
    if (filePath === '') {
      return { entry: null, isFresh: false };
    }

    if (!existsSync(filePath)) {
      return { entry: null, isFresh: false };
    }

    const stat = statSync(filePath);
    if (stat.size > MAX_CACHE_FILE_SIZE_BYTES) {
      return { entry: null, isFresh: false };
    }

    const ageSeconds = (Date.now() - stat.mtimeMs) / 1000;
    const isFresh = ageSeconds < ttlSeconds;

    const content = readFileSync(filePath, 'utf-8');
    if (content.trim() === '') {
      return { entry: null, isFresh };
    }

    const parsed: unknown = JSON.parse(content);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return { entry: null, isFresh };
    }

    return { entry: parsed as CacheEntry, isFresh };
  } catch {
    return { entry: null, isFresh: false };
  }
}
