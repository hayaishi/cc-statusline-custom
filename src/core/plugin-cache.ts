/**
 * Plugin cache management.
 *
 * Provides synchronous cache reading for the statusline hot path
 * and cache writing for background updates.
 */

import {
  readFileSync,
  writeFileSync,
  existsSync,
  statSync,
  mkdirSync,
  renameSync,
  unlinkSync,
} from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { PLUGIN_CACHE_DIR_NAME, type PluginCacheEntry, type PluginConfig } from '../types/plugin.js';

/**
 * Maximum cache file size in bytes (4KB - plugins may have larger output than subscription).
 */
const MAX_PLUGIN_CACHE_FILE_SIZE_BYTES = 4096;

/**
 * Generate a unique session ID.
 * Called once at module load time to establish the current session.
 */
export function generateSessionId(): string {
  return randomBytes(8).toString('hex') + '-' + Date.now().toString(36);
}

/**
 * Current session ID - generated once when the module loads.
 * Used for session_start refresh detection.
 */
export const CURRENT_SESSION_ID = generateSessionId();

/**
 * Get the cache file path for a plugin.
 *
 * @param pluginId - Plugin identifier
 * @param cacheDir - Base cache directory
 * @returns Full path to the plugin's cache file
 */
export function getPluginCacheFilePath(pluginId: string, cacheDir: string): string {
  return join(cacheDir, PLUGIN_CACHE_DIR_NAME, `${pluginId}.json`);
}

/**
 * Get the plugins cache directory path.
 */
function getPluginsCacheDir(cacheDir: string): string {
  return join(cacheDir, PLUGIN_CACHE_DIR_NAME);
}

/**
 * Ensures the plugins cache directory exists.
 */
function ensurePluginsCacheDir(cacheDir: string): void {
  const dir = getPluginsCacheDir(cacheDir);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
}

/**
 * Read a plugin cache entry synchronously.
 *
 * @param pluginId - Plugin identifier
 * @param cacheDir - Base cache directory
 * @param ttlSeconds - TTL in seconds (0 = check sessionId only if provided)
 * @param sessionId - Optional session ID for session_start checking
 * @returns Cached entry or null if unavailable/invalid/stale
 */
export function readPluginCacheSync(
  pluginId: string,
  cacheDir: string,
  ttlSeconds: number,
  sessionId?: string
): PluginCacheEntry | null {
  try {
    const filePath = getPluginCacheFilePath(pluginId, cacheDir);

    if (!existsSync(filePath)) {
      return null;
    }

    const stat = statSync(filePath);
    if (stat.size > MAX_PLUGIN_CACHE_FILE_SIZE_BYTES) {
      return null;
    }

    // Check mtime-based TTL (only if ttlSeconds > 0)
    if (ttlSeconds > 0) {
      const ageSeconds = (Date.now() - stat.mtimeMs) / 1000;
      if (ageSeconds >= ttlSeconds) {
        return null;
      }
    }

    const content = readFileSync(filePath, 'utf-8');
    if (content.trim() === '') {
      return null;
    }

    const parsed: unknown = JSON.parse(content);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return null;
    }

    const entry = parsed as PluginCacheEntry;

    // For TTL 0 with sessionId, check sessionId match
    if (ttlSeconds === 0 && sessionId !== undefined) {
      if (entry.sessionId !== sessionId) {
        return null;
      }
    }

    return entry;
  } catch {
    return null;
  }
}

/**
 * Write a plugin cache entry.
 *
 * @param pluginId - Plugin identifier
 * @param value - Command output value
 * @param cacheDir - Base cache directory
 * @param error - Error message if command failed
 * @param sessionId - Optional session ID for session_start tracking
 */
export function writePluginCache(
  pluginId: string,
  value: string,
  cacheDir: string,
  error: string | null = null,
  sessionId?: string
): void {
  ensurePluginsCacheDir(cacheDir);

  const entry: PluginCacheEntry = {
    value,
    updatedAt: new Date().toISOString(),
    error,
    ...(sessionId !== undefined && { sessionId }),
  };

  const filePath = getPluginCacheFilePath(pluginId, cacheDir);
  const tempPath = filePath + '.tmp.' + String(process.pid);

  try {
    writeFileSync(tempPath, JSON.stringify(entry), { mode: 0o600 });
    renameSync(tempPath, filePath);
  } catch (writeError) {
    try {
      if (existsSync(tempPath)) {
        unlinkSync(tempPath);
      }
    } catch {
      // Ignore cleanup errors
    }
    throw writeError;
  }
}

/**
 * Determine if a plugin's cache should be refreshed.
 *
 * @param config - Plugin configuration
 * @param cacheDir - Base cache directory
 * @returns true if refresh is needed
 */
export function shouldRefreshPlugin(config: PluginConfig, cacheDir: string): boolean {
  try {
    const filePath = getPluginCacheFilePath(config.id, cacheDir);

    if (!existsSync(filePath)) {
      return true;
    }

    const stat = statSync(filePath);

    // Check mtime-based TTL first (if TTL > 0)
    if (config.ttl > 0) {
      const ageSeconds = (Date.now() - stat.mtimeMs) / 1000;
      if (ageSeconds >= config.ttl) {
        return true;
      }
    }

    // If TTL is 0 and no refreshOn, always refresh
    if (config.ttl === 0 && config.refreshOn === undefined) {
      return true;
    }

    // For session_start, check sessionId
    if (config.refreshOn === 'session_start') {
      const content = readFileSync(filePath, 'utf-8');
      const parsed: unknown = JSON.parse(content);
      if (typeof parsed !== 'object' || parsed === null) {
        return true;
      }
      const entry = parsed as PluginCacheEntry;
      if (entry.sessionId !== CURRENT_SESSION_ID) {
        return true;
      }
    }

    return false;
  } catch {
    return true;
  }
}
