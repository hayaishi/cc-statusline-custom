import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  executePluginCommand,
  executePluginCommandSync,
  updatePluginCaches,
} from './plugin-executor.js';
import type { PluginConfig } from '../types/plugin.js';
import { CURRENT_SESSION_ID } from '../core/plugin-cache.js';

describe('plugin-executor', () => {
  let tempDir: string;
  let pluginCacheDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'plugin-executor-test-'));
    pluginCacheDir = join(tempDir, 'plugins');
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('executePluginCommand', () => {
    it('should execute simple command and return output', async () => {
      const config: PluginConfig = {
        id: 'test',
        command: 'echo hello',
        ttl: 60,
      };

      const result = await executePluginCommand(config);
      expect(result.success).toBe(true);
      expect(result.value).toBe('hello');
      expect(result.error).toBeNull();
    });

    it('should trim output whitespace', async () => {
      const config: PluginConfig = {
        id: 'test',
        command: 'echo "  hello  "',
        ttl: 60,
      };

      const result = await executePluginCommand(config);
      expect(result.value).toBe('hello');
    });

    it('should handle multiline output and take first line', async () => {
      const config: PluginConfig = {
        id: 'test',
        command: 'printf "line1\\nline2\\nline3"',
        ttl: 60,
      };

      const result = await executePluginCommand(config);
      expect(result.value).toBe('line1');
    });

    it('should truncate output to maxLength', async () => {
      const config: PluginConfig = {
        id: 'test',
        command: 'echo "this is a very long string that should be truncated"',
        ttl: 60,
        maxLength: 10,
      };

      const result = await executePluginCommand(config);
      expect(result.value.length).toBeLessThanOrEqual(10);
    });

    it('should return error for failing command', async () => {
      const config: PluginConfig = {
        id: 'test',
        command: 'exit 1',
        ttl: 60,
      };

      const result = await executePluginCommand(config);
      expect(result.success).toBe(false);
      expect(result.error).not.toBeNull();
    });

    it('should return error for command that times out', async () => {
      const config: PluginConfig = {
        id: 'test',
        command: 'sleep 10',
        ttl: 60,
        timeout: 100, // 100ms timeout
      };

      const result = await executePluginCommand(config);
      expect(result.success).toBe(false);
      expect(result.error).toContain('timeout');
    }, 5000);

    it('should use workingDir if specified', async () => {
      const config: PluginConfig = {
        id: 'test',
        command: 'pwd',
        ttl: 60,
        workingDir: '/tmp',
      };

      const result = await executePluginCommand(config);
      expect(result.success).toBe(true);
      expect(result.value).toBe('/tmp');
    });

    it('should handle command not found', async () => {
      const config: PluginConfig = {
        id: 'test',
        command: 'nonexistentcommand12345',
        ttl: 60,
      };

      const result = await executePluginCommand(config);
      expect(result.success).toBe(false);
      expect(result.error).not.toBeNull();
    });
  });

  describe('executePluginCommandSync', () => {
    it('should execute command synchronously', () => {
      const config: PluginConfig = {
        id: 'test',
        command: 'echo sync-test',
        ttl: 60,
      };

      const result = executePluginCommandSync(config);
      expect(result.success).toBe(true);
      expect(result.value).toBe('sync-test');
    });

    it('should handle sync command timeout', () => {
      const config: PluginConfig = {
        id: 'test',
        command: 'sleep 10',
        ttl: 60,
        timeout: 100,
      };

      const result = executePluginCommandSync(config);
      expect(result.success).toBe(false);
      expect(result.error).toContain('timeout');
    }, 5000);
  });

  describe('updatePluginCaches', () => {
    it('should update cache for plugins that need refresh', async () => {
      const configs: PluginConfig[] = [
        { id: 'plugin1', command: 'echo value1', ttl: 60 },
        { id: 'plugin2', command: 'echo value2', ttl: 60 },
      ];

      await updatePluginCaches(configs, tempDir);

      // Check both caches were written
      const cache1 = join(pluginCacheDir, 'plugin1.json');
      const cache2 = join(pluginCacheDir, 'plugin2.json');
      expect(existsSync(cache1)).toBe(true);
      expect(existsSync(cache2)).toBe(true);

      const content1 = JSON.parse(readFileSync(cache1, 'utf-8'));
      expect(content1.value).toBe('value1');
    });

    it('should include sessionId when refreshOn is session_start', async () => {
      const configs: PluginConfig[] = [
        { id: 'plugin1', command: 'echo value1', ttl: 0, refreshOn: 'session_start' },
      ];

      await updatePluginCaches(configs, tempDir);

      const cache1 = join(pluginCacheDir, 'plugin1.json');
      const content1 = JSON.parse(readFileSync(cache1, 'utf-8'));
      expect(content1.sessionId).toBe(CURRENT_SESSION_ID);
    });

    it('should skip plugins that do not need refresh', async () => {
      // Pre-populate cache
      mkdirSync(pluginCacheDir, { recursive: true });
      const { writeFileSync } = await import('node:fs');
      writeFileSync(
        join(pluginCacheDir, 'plugin1.json'),
        JSON.stringify({
          value: 'cached',
          updatedAt: new Date().toISOString(),
          error: null,
        })
      );

      const configs: PluginConfig[] = [
        { id: 'plugin1', command: 'echo new-value', ttl: 3600 }, // Very long TTL
      ];

      // Run update
      await updatePluginCaches(configs, tempDir);

      // Value should still be cached value (not updated)
      const content = JSON.parse(readFileSync(join(pluginCacheDir, 'plugin1.json'), 'utf-8'));
      expect(content.value).toBe('cached');
    });

    it('should handle errors gracefully and continue with other plugins', async () => {
      const configs: PluginConfig[] = [
        { id: 'plugin1', command: 'exit 1', ttl: 60 }, // Will fail
        { id: 'plugin2', command: 'echo success', ttl: 60 }, // Will succeed
      ];

      await updatePluginCaches(configs, tempDir);

      // Both should have cache entries
      const cache1 = join(pluginCacheDir, 'plugin1.json');
      const cache2 = join(pluginCacheDir, 'plugin2.json');
      expect(existsSync(cache1)).toBe(true);
      expect(existsSync(cache2)).toBe(true);

      // plugin1 should have error
      const content1 = JSON.parse(readFileSync(cache1, 'utf-8'));
      expect(content1.error).not.toBeNull();

      // plugin2 should have value
      const content2 = JSON.parse(readFileSync(cache2, 'utf-8'));
      expect(content2.value).toBe('success');
    });
  });
});
