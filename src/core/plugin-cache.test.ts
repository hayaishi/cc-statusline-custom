import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, existsSync, readFileSync, mkdirSync, utimesSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  readPluginCacheSync,
  writePluginCache,
  shouldRefreshPlugin,
  getPluginCacheFilePath,
  generateSessionId,
  CURRENT_SESSION_ID,
} from './plugin-cache.js';
import type { PluginConfig, PluginCacheEntry } from '../types/plugin.js';

describe('plugin-cache', () => {
  let tempDir: string;
  let pluginCacheDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'plugin-cache-test-'));
    pluginCacheDir = join(tempDir, 'plugins');
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('getPluginCacheFilePath', () => {
    it('should return correct path for plugin id', () => {
      const path = getPluginCacheFilePath('git_branch', tempDir);
      expect(path).toBe(join(tempDir, 'plugins', 'git_branch.json'));
    });

    it('should sanitize plugin id with special characters', () => {
      const path = getPluginCacheFilePath('my-plugin', tempDir);
      expect(path).toBe(join(tempDir, 'plugins', 'my-plugin.json'));
    });
  });

  describe('generateSessionId', () => {
    it('should return a non-empty string', () => {
      const id = generateSessionId();
      expect(id).toBeTruthy();
      expect(typeof id).toBe('string');
    });

    it('should return same value for CURRENT_SESSION_ID', () => {
      expect(CURRENT_SESSION_ID).toBe(CURRENT_SESSION_ID);
      expect(CURRENT_SESSION_ID.length).toBeGreaterThan(0);
    });
  });

  describe('readPluginCacheSync', () => {
    it('should return null when cache file does not exist', () => {
      const result = readPluginCacheSync('nonexistent', tempDir, 60);
      expect(result).toBeNull();
    });

    it('should return cached entry when valid and within TTL', () => {
      mkdirSync(pluginCacheDir, { recursive: true });
      const entry: PluginCacheEntry = {
        value: 'main',
        updatedAt: new Date().toISOString(),
        error: null,
        sessionId: 'test-session',
      };
      writeFileSync(join(pluginCacheDir, 'git_branch.json'), JSON.stringify(entry));

      const result = readPluginCacheSync('git_branch', tempDir, 60);
      expect(result).not.toBeNull();
      expect(result?.value).toBe('main');
    });

    it('should return null when cache is expired (TTL exceeded)', () => {
      mkdirSync(pluginCacheDir, { recursive: true });
      const entry: PluginCacheEntry = {
        value: 'main',
        updatedAt: new Date(Date.now() - 120000).toISOString(), // 2 minutes ago
        error: null,
      };
      writeFileSync(join(pluginCacheDir, 'git_branch.json'), JSON.stringify(entry));

      // Backdate mtime so TTL check sees this entry as stale
      const filePath = join(pluginCacheDir, 'git_branch.json');
      const pastTime = new Date(Date.now() - 120000);
      utimesSync(filePath, pastTime, pastTime);

      const result = readPluginCacheSync('git_branch', tempDir, 60);
      expect(result).toBeNull();
    });

    it('should return entry with error when last execution failed', () => {
      mkdirSync(pluginCacheDir, { recursive: true });
      const entry: PluginCacheEntry = {
        value: '',
        updatedAt: new Date().toISOString(),
        error: 'Command failed',
      };
      writeFileSync(join(pluginCacheDir, 'git_branch.json'), JSON.stringify(entry));

      const result = readPluginCacheSync('git_branch', tempDir, 60);
      expect(result).not.toBeNull();
      expect(result?.error).toBe('Command failed');
    });

    it('should return null for invalid JSON', () => {
      mkdirSync(pluginCacheDir, { recursive: true });
      writeFileSync(join(pluginCacheDir, 'broken.json'), 'not valid json');

      const result = readPluginCacheSync('broken', tempDir, 60);
      expect(result).toBeNull();
    });

    it('should return entry when TTL is 0 and cache exists', () => {
      mkdirSync(pluginCacheDir, { recursive: true });
      const entry: PluginCacheEntry = {
        value: 'main',
        updatedAt: new Date().toISOString(),
        error: null,
        sessionId: CURRENT_SESSION_ID,
      };
      writeFileSync(join(pluginCacheDir, 'git_branch.json'), JSON.stringify(entry));

      // TTL 0 means no TTL check, just use cache if sessionId matches
      const result = readPluginCacheSync('git_branch', tempDir, 0, CURRENT_SESSION_ID);
      expect(result).not.toBeNull();
    });
  });

  describe('writePluginCache', () => {
    it('should create plugins directory if not exists', () => {
      writePluginCache('test', 'hello', tempDir);
      expect(existsSync(pluginCacheDir)).toBe(true);
    });

    it('should write cache entry with value', () => {
      writePluginCache('test', 'hello world', tempDir);

      const filePath = join(pluginCacheDir, 'test.json');
      expect(existsSync(filePath)).toBe(true);

      const content = JSON.parse(readFileSync(filePath, 'utf-8'));
      expect(content.value).toBe('hello world');
      expect(content.error).toBeNull();
      expect(content.updatedAt).toBeTruthy();
    });

    it('should write cache entry with error', () => {
      writePluginCache('test', '', tempDir, 'Command timed out');

      const filePath = join(pluginCacheDir, 'test.json');
      const content = JSON.parse(readFileSync(filePath, 'utf-8'));
      expect(content.value).toBe('');
      expect(content.error).toBe('Command timed out');
    });

    it('should include sessionId when provided', () => {
      writePluginCache('test', 'value', tempDir, null, 'session-123');

      const filePath = join(pluginCacheDir, 'test.json');
      const content = JSON.parse(readFileSync(filePath, 'utf-8'));
      expect(content.sessionId).toBe('session-123');
    });

    it('should overwrite existing cache', () => {
      writePluginCache('test', 'first', tempDir);
      writePluginCache('test', 'second', tempDir);

      const filePath = join(pluginCacheDir, 'test.json');
      const content = JSON.parse(readFileSync(filePath, 'utf-8'));
      expect(content.value).toBe('second');
    });

    it('should write cache file with 0o600 permissions', () => {
      writePluginCache('test', 'value', tempDir);
      const filePath = getPluginCacheFilePath('test', tempDir);
      const mode = statSync(filePath).mode & 0o777;
      expect(mode).toBe(0o600);
    });
  });

  describe('shouldRefreshPlugin', () => {
    const baseConfig: PluginConfig = {
      id: 'test',
      command: 'echo hello',
      ttl: 60,
    };

    it('should return true when cache does not exist', () => {
      const result = shouldRefreshPlugin(baseConfig, tempDir);
      expect(result).toBe(true);
    });

    it('should return false when cache is fresh', () => {
      mkdirSync(pluginCacheDir, { recursive: true });
      const entry: PluginCacheEntry = {
        value: 'hello',
        updatedAt: new Date().toISOString(),
        error: null,
      };
      writeFileSync(join(pluginCacheDir, 'test.json'), JSON.stringify(entry));

      const result = shouldRefreshPlugin(baseConfig, tempDir);
      expect(result).toBe(false);
    });

    it('should return true when cache is stale', () => {
      mkdirSync(pluginCacheDir, { recursive: true });
      const entry: PluginCacheEntry = {
        value: 'hello',
        updatedAt: new Date().toISOString(),
        error: null,
      };
      const filePath = join(pluginCacheDir, 'test.json');
      writeFileSync(filePath, JSON.stringify(entry));

      // Backdate mtime so TTL check sees this entry as stale
      const pastTime = new Date(Date.now() - 120000);
      utimesSync(filePath, pastTime, pastTime);

      const result = shouldRefreshPlugin(baseConfig, tempDir);
      expect(result).toBe(true);
    });

    it('should return true when refreshOn is session_start and sessionId differs', () => {
      mkdirSync(pluginCacheDir, { recursive: true });
      const entry: PluginCacheEntry = {
        value: 'hello',
        updatedAt: new Date().toISOString(),
        error: null,
        sessionId: 'old-session',
      };
      writeFileSync(join(pluginCacheDir, 'test.json'), JSON.stringify(entry));

      const config: PluginConfig = {
        ...baseConfig,
        refreshOn: 'session_start',
      };

      const result = shouldRefreshPlugin(config, tempDir);
      expect(result).toBe(true);
    });

    it('should return false when refreshOn is session_start and sessionId matches', () => {
      mkdirSync(pluginCacheDir, { recursive: true });
      const entry: PluginCacheEntry = {
        value: 'hello',
        updatedAt: new Date().toISOString(),
        error: null,
        sessionId: CURRENT_SESSION_ID,
      };
      writeFileSync(join(pluginCacheDir, 'test.json'), JSON.stringify(entry));

      const config: PluginConfig = {
        ...baseConfig,
        ttl: 0, // no TTL expiry
        refreshOn: 'session_start',
      };

      const result = shouldRefreshPlugin(config, tempDir);
      expect(result).toBe(false);
    });

    it('should return true when ttl is 0 and refreshOn is not set', () => {
      mkdirSync(pluginCacheDir, { recursive: true });
      const entry: PluginCacheEntry = {
        value: 'hello',
        updatedAt: new Date().toISOString(),
        error: null,
      };
      writeFileSync(join(pluginCacheDir, 'test.json'), JSON.stringify(entry));

      const config: PluginConfig = {
        ...baseConfig,
        ttl: 0,
      };

      // TTL 0 without refreshOn means always refresh
      const result = shouldRefreshPlugin(config, tempDir);
      expect(result).toBe(true);
    });
  });
});
