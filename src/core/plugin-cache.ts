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
import { shortHash } from '../utils/hash.js';

// Guard against corrupted or externally-written cache files
const MAX_PLUGIN_CACHE_FILE_SIZE_BYTES = 4096;

export function generateSessionId(): string {
  return randomBytes(8).toString('hex') + '-' + Date.now().toString(36);
}

export const CURRENT_SESSION_ID = generateSessionId();

export function getPluginCacheFilePath(pluginId: string, cacheDir: string, workingDir?: string): string {
  const base = join(cacheDir, PLUGIN_CACHE_DIR_NAME);
  if (workingDir !== undefined) {
    return join(base, shortHash(workingDir), `${pluginId}.json`);
  }
  return join(base, `${pluginId}.json`);
}

function ensurePluginsCacheDir(cacheDir: string, workingDir?: string): void {
  const dir = workingDir !== undefined
    ? join(cacheDir, PLUGIN_CACHE_DIR_NAME, shortHash(workingDir))
    : join(cacheDir, PLUGIN_CACHE_DIR_NAME);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
}

/**
 * Internal function to read and validate cache file structure.
 * Returns null if file doesn't exist, is corrupted, or exceeds size limits.
 */
function readCacheFileBase(
  pluginId: string,
  cacheDir: string,
  workingDir?: string
): PluginCacheEntry | null {
  try {
    const filePath = getPluginCacheFilePath(pluginId, cacheDir, workingDir);
    if (!existsSync(filePath)) {
      return null;
    }

    const stat = statSync(filePath);
    if (stat.size > MAX_PLUGIN_CACHE_FILE_SIZE_BYTES) {
      return null;
    }

    const content = readFileSync(filePath, 'utf-8');
    if (content.trim() === '') {
      return null;
    }

    const parsed: unknown = JSON.parse(content);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return null;
    }

    return parsed as PluginCacheEntry;
  } catch {
    return null;
  }
}

export function readPluginCacheSync(
  pluginId: string,
  cacheDir: string,
  ttlSeconds: number,
  sessionId?: string,
  workingDir?: string
): PluginCacheEntry | null {
  const entry = readCacheFileBase(pluginId, cacheDir, workingDir);
  if (entry === null) {
    return null;
  }

  // Apply TTL check if configured
  if (ttlSeconds > 0) {
    const filePath = getPluginCacheFilePath(pluginId, cacheDir, workingDir);
    const ageSeconds = (Date.now() - statSync(filePath).mtimeMs) / 1000;
    if (ageSeconds >= ttlSeconds) {
      return null;
    }
  }

  // Apply session expiration check
  const isSessionExpired = ttlSeconds === 0 && sessionId !== undefined && entry.sessionId !== sessionId;
  if (isSessionExpired) {
    return null;
  }

  return entry;
}

/**
 * Reads plugin cache for display purposes (stale-while-revalidate pattern).
 * Unlike readPluginCacheSync, this function:
 * - Does NOT check TTL expiry
 * - Does NOT check session ID
 * - Only returns null if the cache file is missing, corrupted, or exceeds size limits
 *
 * Use shouldRefreshPlugin() separately to determine if background refresh is needed.
 *
 * @param pluginId - Plugin identifier
 * @param cacheDir - Base cache directory
 * @param workingDir - Optional working directory for cache isolation
 * @returns Cache entry if readable, null otherwise
 */
export function readPluginCacheForDisplay(
  pluginId: string,
  cacheDir: string,
  workingDir?: string
): PluginCacheEntry | null {
  return readCacheFileBase(pluginId, cacheDir, workingDir);
}

export function writePluginCache(
  pluginId: string,
  value: string,
  cacheDir: string,
  error: string | null = null,
  sessionId?: string,
  workingDir?: string
): void {
  ensurePluginsCacheDir(cacheDir, workingDir);

  const entry: PluginCacheEntry = {
    value,
    updatedAt: new Date().toISOString(),
    error,
    ...(sessionId !== undefined && { sessionId }),
  };

  const filePath = getPluginCacheFilePath(pluginId, cacheDir, workingDir);
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
      // best-effort cleanup
    }
    throw writeError;
  }
}

export function shouldRefreshPlugin(config: PluginConfig, cacheDir: string, workingDir?: string): boolean {
  try {
    const filePath = getPluginCacheFilePath(config.id, cacheDir, workingDir);
    if (!existsSync(filePath)) return true;

    if (config.ttl > 0) {
      const ageSeconds = (Date.now() - statSync(filePath).mtimeMs) / 1000;
      if (ageSeconds >= config.ttl) return true;
    }

    if (config.ttl === 0 && config.refreshOn === undefined) return true;

    if (config.refreshOn === 'session_start') {
      return readPluginCacheSync(config.id, cacheDir, 0, CURRENT_SESSION_ID, workingDir) === null;
    }

    return false;
  } catch {
    return true;
  }
}
