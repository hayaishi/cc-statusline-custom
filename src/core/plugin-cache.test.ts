import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, existsSync, readFileSync, mkdirSync, utimesSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  readPluginCacheSync,
  readPluginCacheForDisplay,
  writePluginCache,
  shouldRefreshPlugin,
  getPluginCacheFilePath,
  generateSessionId,
  CURRENT_SESSION_ID,
} from './plugin-cache.js';
import type { PluginConfig, PluginCacheEntry } from '../types/plugin.js';
import { shortHash } from '../utils/hash.js';

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

    it('should include hash subdirectory when workingDir is provided', () => {
      const path = getPluginCacheFilePath('test', tempDir, '/Users/test/project');
      expect(path).toMatch(/plugins\/[0-9a-f]{8}\/test\.json$/);
    });

    it('should use legacy path when workingDir is undefined', () => {
      const path = getPluginCacheFilePath('test', tempDir);
      expect(path).toBe(join(tempDir, 'plugins', 'test.json'));
    });

    it('should produce consistent paths for same workingDir', () => {
      const path1 = getPluginCacheFilePath('test', tempDir, '/path/a');
      const path2 = getPluginCacheFilePath('test', tempDir, '/path/a');
      expect(path1).toBe(path2);
    });

    it('should produce different paths for different workingDirs', () => {
      const path1 = getPluginCacheFilePath('test', tempDir, '/path/a');
      const path2 = getPluginCacheFilePath('test', tempDir, '/path/b');
      expect(path1).not.toBe(path2);
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

    it('should read from workingDir-specific path when provided', () => {
      writePluginCache('test', 'dir-value', tempDir, null, undefined, '/my/project');

      const result = readPluginCacheSync('test', tempDir, 60, undefined, '/my/project');
      expect(result).not.toBeNull();
      expect(result?.value).toBe('dir-value');
    });

    it('should return null when workingDir does not match written path', () => {
      writePluginCache('test', 'dir-value', tempDir, null, undefined, '/project/a');

      const result = readPluginCacheSync('test', tempDir, 60, undefined, '/project/b');
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

  describe('readPluginCacheForDisplay', () => {
    it('should return cached entry when valid and within TTL', () => {
      mkdirSync(pluginCacheDir, { recursive: true });
      const entry: PluginCacheEntry = {
        value: 'fresh-value',
        updatedAt: new Date().toISOString(),
        error: null,
      };
      writeFileSync(join(pluginCacheDir, 'test.json'), JSON.stringify(entry));

      const result = readPluginCacheForDisplay('test', tempDir);
      expect(result).not.toBeNull();
      expect(result?.value).toBe('fresh-value');
    });

    it('should return cached entry even when TTL is expired', () => {
      mkdirSync(pluginCacheDir, { recursive: true });
      const entry: PluginCacheEntry = {
        value: 'stale-value',
        updatedAt: new Date(Date.now() - 120000).toISOString(),
        error: null,
      };
      const filePath = join(pluginCacheDir, 'test.json');
      writeFileSync(filePath, JSON.stringify(entry));

      // Backdate mtime so TTL check would fail in readPluginCacheSync
      const pastTime = new Date(Date.now() - 120000);
      utimesSync(filePath, pastTime, pastTime);

      const result = readPluginCacheForDisplay('test', tempDir, undefined);
      expect(result).not.toBeNull();
      expect(result?.value).toBe('stale-value');
    });

    it('should return cached entry even when session ID differs', () => {
      mkdirSync(pluginCacheDir, { recursive: true });
      const entry: PluginCacheEntry = {
        value: 'old-session-value',
        updatedAt: new Date().toISOString(),
        error: null,
        sessionId: 'old-session-id',
      };
      writeFileSync(join(pluginCacheDir, 'test.json'), JSON.stringify(entry));

      const result = readPluginCacheForDisplay('test', tempDir);
      expect(result).not.toBeNull();
      expect(result?.value).toBe('old-session-value');
      expect(result?.sessionId).toBe('old-session-id');
    });

    it('should return null when cache file does not exist', () => {
      const result = readPluginCacheForDisplay('nonexistent', tempDir);
      expect(result).toBeNull();
    });

    it('should return null for invalid JSON', () => {
      mkdirSync(pluginCacheDir, { recursive: true });
      writeFileSync(join(pluginCacheDir, 'broken.json'), 'not valid json');

      const result = readPluginCacheForDisplay('broken', tempDir);
      expect(result).toBeNull();
    });

    it('should return null when file exceeds size limit', () => {
      mkdirSync(pluginCacheDir, { recursive: true });
      const largeContent = JSON.stringify({ value: 'x'.repeat(5000), updatedAt: new Date().toISOString(), error: null });
      writeFileSync(join(pluginCacheDir, 'large.json'), largeContent);

      const result = readPluginCacheForDisplay('large', tempDir);
      expect(result).toBeNull();
    });

    it('should return entry with error field intact', () => {
      mkdirSync(pluginCacheDir, { recursive: true });
      const entry: PluginCacheEntry = {
        value: '',
        updatedAt: new Date().toISOString(),
        error: 'Command failed',
      };
      writeFileSync(join(pluginCacheDir, 'error.json'), JSON.stringify(entry));

      const result = readPluginCacheForDisplay('error', tempDir);
      expect(result).not.toBeNull();
      expect(result?.error).toBe('Command failed');
    });

    it('should read from workingDir-specific path when provided', () => {
      writePluginCache('test', 'dir-value', tempDir, null, undefined, '/my/project');

      const result = readPluginCacheForDisplay('test', tempDir, '/my/project');
      expect(result).not.toBeNull();
      expect(result?.value).toBe('dir-value');
    });

    describe('max-age validation', () => {
      it('should return null when cache exceeds maximum age (10 minutes)', () => {
        mkdirSync(pluginCacheDir, { recursive: true });
        const entry: PluginCacheEntry = {
          value: 'very-old-value',
          updatedAt: new Date(Date.now() - 11 * 60 * 1000).toISOString(), // 11 minutes ago
          error: null,
        };
        writeFileSync(join(pluginCacheDir, 'test.json'), JSON.stringify(entry));

        const result = readPluginCacheForDisplay('test', tempDir);
        expect(result).toBeNull();
      });

      it('should return cache when within maximum age but beyond TTL (stale-while-revalidate)', () => {
        mkdirSync(pluginCacheDir, { recursive: true });
        const entry: PluginCacheEntry = {
          value: 'stale-value',
          updatedAt: new Date(Date.now() - 9 * 60 * 1000).toISOString(), // 9 minutes ago
          error: null,
        };
        const filePath = join(pluginCacheDir, 'test.json');
        writeFileSync(filePath, JSON.stringify(entry));

        // Backdate mtime so TTL would be expired
        const pastTime = new Date(Date.now() - 9 * 60 * 1000);
        utimesSync(filePath, pastTime, pastTime);

        const result = readPluginCacheForDisplay('test', tempDir);
        expect(result).not.toBeNull();
        expect(result?.value).toBe('stale-value');
      });

      it('should return cache when just under maximum age boundary', () => {
        mkdirSync(pluginCacheDir, { recursive: true });
        const entry: PluginCacheEntry = {
          value: 'boundary-value',
          updatedAt: new Date(Date.now() - 9 * 60 * 1000 - 59 * 1000).toISOString(), // 9 minutes 59 seconds ago
          error: null,
        };
        writeFileSync(join(pluginCacheDir, 'test.json'), JSON.stringify(entry));

        const result = readPluginCacheForDisplay('test', tempDir);
        expect(result).not.toBeNull();
        expect(result?.value).toBe('boundary-value');
      });

      it('should return null when updatedAt is invalid date string', () => {
        mkdirSync(pluginCacheDir, { recursive: true });
        const entry = {
          value: 'corrupted-date',
          updatedAt: 'not-a-valid-date',
          error: null,
        };
        writeFileSync(join(pluginCacheDir, 'test.json'), JSON.stringify(entry));

        const result = readPluginCacheForDisplay('test', tempDir);
        expect(result).toBeNull();
      });

      it('should return null when updatedAt is missing', () => {
        mkdirSync(pluginCacheDir, { recursive: true });
        // Manually construct malformed cache entry without updatedAt
        const malformed = { value: 'no-timestamp', error: null };
        writeFileSync(join(pluginCacheDir, 'test.json'), JSON.stringify(malformed));

        const result = readPluginCacheForDisplay('test', tempDir);
        expect(result).toBeNull();
      });

      it('should apply max-age to cache with error field', () => {
        mkdirSync(pluginCacheDir, { recursive: true });
        const entry: PluginCacheEntry = {
          value: '',
          updatedAt: new Date(Date.now() - 11 * 60 * 1000).toISOString(),
          error: 'Old error message',
        };
        writeFileSync(join(pluginCacheDir, 'test.json'), JSON.stringify(entry));

        const result = readPluginCacheForDisplay('test', tempDir);
        expect(result).toBeNull();
      });

      it('should apply max-age to workingDir-specific cache paths', () => {
        mkdirSync(pluginCacheDir, { recursive: true });
        const entry: PluginCacheEntry = {
          value: 'old-dir-value',
          updatedAt: new Date(Date.now() - 11 * 60 * 1000).toISOString(),
          error: null,
        };

        // Write cache with old timestamp
        const hash = shortHash('/my/project');
        const dirPath = join(pluginCacheDir, hash);
        mkdirSync(dirPath, { recursive: true });
        writeFileSync(join(dirPath, 'test.json'), JSON.stringify(entry));

        const result = readPluginCacheForDisplay('test', tempDir, '/my/project');
        expect(result).toBeNull();
      });
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

    it('should write to workingDir-specific subdirectory when provided', () => {
      writePluginCache('test', 'project-a-value', tempDir, null, undefined, '/project/a');

      const filePath = getPluginCacheFilePath('test', tempDir, '/project/a');
      expect(existsSync(filePath)).toBe(true);

      const content = JSON.parse(readFileSync(filePath, 'utf-8'));
      expect(content.value).toBe('project-a-value');
    });

    it('should isolate caches between different workingDirs', () => {
      writePluginCache('test', 'value-a', tempDir, null, undefined, '/project/a');
      writePluginCache('test', 'value-b', tempDir, null, undefined, '/project/b');

      const pathA = getPluginCacheFilePath('test', tempDir, '/project/a');
      const pathB = getPluginCacheFilePath('test', tempDir, '/project/b');
      expect(JSON.parse(readFileSync(pathA, 'utf-8')).value).toBe('value-a');
      expect(JSON.parse(readFileSync(pathB, 'utf-8')).value).toBe('value-b');
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
