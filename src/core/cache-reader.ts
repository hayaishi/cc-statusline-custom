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
import type { CacheKey, CacheEntryBase } from '../types/cache.js';

/**
 * Checks if the lock file is fresh (< threshold seconds old).
 *
 * @param cacheDir - Cache directory path
 * @returns true if lock file exists and is fresh
 */
function isLockFileFresh(cacheDir: string): boolean {
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
  return join(cacheDir, CACHE_FILE_NAMES[key]);
}

/**
 * Reads a cache entry synchronously.
 *
 * @param key - Cache key ('dailyTotal' | 'blockInfo' | 'burnRate')
 * @param cacheDir - Cache directory path (optional, defaults to ~/.cache/ccusage-statusline)
 * @param ttlSeconds - TTL in seconds (optional, defaults to 60)
 * @returns The cached entry or null if unavailable/invalid/stale
 */
export function readCacheSync(
  key: CacheKey,
  cacheDir: string = DEFAULT_CACHE_DIR,
  ttlSeconds: number = DEFAULT_CACHE_TTL_SECONDS
): CacheEntryBase | null {
  try {
    // Skip if lock file is fresh (write in progress)
    if (isLockFileFresh(cacheDir)) {
      return null;
    }

    const filePath = getCacheFilePath(key, cacheDir);

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

    return parsed as CacheEntryBase;
  } catch {
    // Never throw - return null on any error
    return null;
  }
}

/**
 * Checks if a cache entry is stale (older than TTL).
 *
 * @param entry - Cache entry to check
 * @param ttlSeconds - TTL in seconds
 * @returns true if the entry is stale
 */
export function isCacheStale(entry: CacheEntryBase, ttlSeconds: number): boolean {
  if (!Number.isFinite(entry.updated_at)) {
    return true;
  }

  const ageSeconds = (Date.now() - entry.updated_at) / 1000;
  return ageSeconds >= ttlSeconds;
}
