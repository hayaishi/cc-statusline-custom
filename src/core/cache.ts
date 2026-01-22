/**
 * Cache read/write utilities for the cache updater.
 *
 * This module provides atomic writes and lock management for the cache.
 * Used only by the cache updater, not the statusline hot path.
 */

import {
  writeFileSync,
  renameSync,
  unlinkSync,
  existsSync,
  mkdirSync,
  statSync,
  openSync,
  closeSync,
} from 'node:fs';
import { join } from 'node:path';
import {
  CACHE_FILE_NAMES,
  LOCK_FILE_STALE_THRESHOLD_SECONDS,
  DEFAULT_CACHE_DIR,
} from '../types/cache.js';
import type { CacheKey, CacheEntry } from '../types/cache.js';

/**
 * Gets the file path for a cache key.
 */
function getCacheFilePath(key: CacheKey, cacheDir: string): string {
  return join(cacheDir, CACHE_FILE_NAMES[key]);
}

/**
 * Gets the lock file path.
 */
function getLockFilePath(cacheDir: string): string {
  return join(cacheDir, CACHE_FILE_NAMES.lock);
}

/**
 * Ensures a directory exists, creating it if necessary.
 */
function ensureDir(dirPath: string): void {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true, mode: 0o700 });
  }
}

/**
 * Writes a cache entry atomically (write to temp file, then rename).
 *
 * @param key - Cache key
 * @param entry - Cache entry to write
 * @param cacheDir - Cache directory (optional)
 */
export function writeCacheAtomic(
  key: CacheKey,
  entry: CacheEntry,
  cacheDir: string = DEFAULT_CACHE_DIR
): void {
  ensureDir(cacheDir);

  const filePath = getCacheFilePath(key, cacheDir);
  const tempPath = filePath + '.tmp.' + String(process.pid);

  try {
    // Write to temp file
    writeFileSync(tempPath, JSON.stringify(entry), { mode: 0o600 });

    // Atomic rename
    renameSync(tempPath, filePath);
  } catch (error) {
    // Clean up temp file on error
    try {
      if (existsSync(tempPath)) {
        unlinkSync(tempPath);
      }
    } catch {
      // Ignore cleanup errors
    }
    throw error;
  }
}

/**
 * Attempts to acquire a lock for cache writing.
 * Uses atomic file creation (O_CREAT | O_EXCL) to prevent race conditions.
 * Returns false if lock is already held and fresh.
 *
 * @param cacheDir - Cache directory
 * @returns true if lock was acquired, false if already held
 */
export function acquireLock(cacheDir: string = DEFAULT_CACHE_DIR): boolean {
  ensureDir(cacheDir);

  const lockPath = getLockFilePath(cacheDir);

  // Check if stale lock exists and remove it
  if (existsSync(lockPath)) {
    try {
      const stat = statSync(lockPath);
      const ageSeconds = (Date.now() - stat.mtimeMs) / 1000;
      if (ageSeconds < LOCK_FILE_STALE_THRESHOLD_SECONDS) {
        return false; // Lock is fresh, don't acquire
      }
      // Lock is stale, remove it before trying to acquire
      unlinkSync(lockPath);
    } catch {
      // If we can't stat or remove, proceed to atomic create
    }
  }

  // Atomic lock acquisition using O_CREAT | O_EXCL ('wx' mode)
  // This fails if the file already exists, preventing race conditions
  let fd: number | undefined;
  try {
    fd = openSync(lockPath, 'wx', 0o600);
    // Write PID to the lock file
    writeFileSync(fd, String(process.pid));
    return true;
  } catch {
    // EEXIST: file already exists (another process won the race)
    // Other errors: permission denied, etc.
    return false;
  } finally {
    // Ensure fd is always closed, even if writeFileSync fails
    if (fd !== undefined) {
      try {
        closeSync(fd);
      } catch {
        // Ignore close errors
      }
    }
  }
}

/**
 * Releases the cache lock.
 *
 * @param cacheDir - Cache directory
 */
export function releaseLock(cacheDir: string = DEFAULT_CACHE_DIR): void {
  const lockPath = getLockFilePath(cacheDir);
  try {
    if (existsSync(lockPath)) {
      unlinkSync(lockPath);
    }
  } catch {
    // Ignore errors releasing lock
  }
}
