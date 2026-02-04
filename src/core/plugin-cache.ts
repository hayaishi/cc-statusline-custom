/**
 * Plugin cache management for statusline.
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

const MAX_PLUGIN_CACHE_FILE_SIZE_BYTES = 4096;

export function generateSessionId(): string {
  return randomBytes(8).toString('hex') + '-' + Date.now().toString(36);
}

export const CURRENT_SESSION_ID = generateSessionId();

export function getPluginCacheFilePath(pluginId: string, cacheDir: string): string {
  return join(cacheDir, PLUGIN_CACHE_DIR_NAME, `${pluginId}.json`);
}

function ensurePluginsCacheDir(cacheDir: string): void {
  const dir = join(cacheDir, PLUGIN_CACHE_DIR_NAME);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
}

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
    if (ttlSeconds === 0 && sessionId !== undefined && entry.sessionId !== sessionId) {
      return null;
    }

    return entry;
  } catch {
    return null;
  }
}

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

export function shouldRefreshPlugin(config: PluginConfig, cacheDir: string): boolean {
  try {
    const filePath = getPluginCacheFilePath(config.id, cacheDir);
    if (!existsSync(filePath)) {
      return true;
    }

    const stat = statSync(filePath);
    if (config.ttl > 0) {
      const ageSeconds = (Date.now() - stat.mtimeMs) / 1000;
      if (ageSeconds >= config.ttl) {
        return true;
      }
    }

    if (config.ttl === 0 && config.refreshOn === undefined) {
      return true;
    }

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
