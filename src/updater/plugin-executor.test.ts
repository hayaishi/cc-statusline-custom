import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync, mkdirSync, writeFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { executePluginCommand, updatePluginCaches } from './plugin-executor.js';
import type { PluginConfig } from '../types/plugin.js';
import { CURRENT_SESSION_ID } from '../core/plugin-cache.js';

/** Minimal valid PluginConfig with sensible test defaults. */
function makeConfig(overrides: Partial<PluginConfig> = {}): PluginConfig {
  return { id: 'test', command: 'echo hello', ttl: 60, ...overrides };
}

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
      const result = await executePluginCommand(makeConfig());

      expect(result.success).toBe(true);
      expect(result.value).toBe('hello');
      expect(result.error).toBeNull();
    });

    it('should trim output whitespace', async () => {
      const result = await executePluginCommand(makeConfig({ command: 'echo "  hello  "' }));

      expect(result.value).toBe('hello');
    });

    it('should handle multiline output and take first line', async () => {
      const result = await executePluginCommand(makeConfig({ command: 'printf "line1\\nline2\\nline3"' }));

      expect(result.value).toBe('line1');
    });

    it('should truncate output to maxLength', async () => {
      const result = await executePluginCommand(makeConfig({
        command: 'echo "this is a very long string that should be truncated"',
        maxLength: 10,
      }));

      expect(result.value.length).toBeLessThanOrEqual(10);
    });

    it('should return error for failing command', async () => {
      const result = await executePluginCommand(makeConfig({ command: 'exit 1' }));

      expect(result.success).toBe(false);
      expect(result.error).not.toBeNull();
    });

    it('should return error for command that times out', async () => {
      const result = await executePluginCommand(makeConfig({ command: 'sleep 10', timeout: 100 }));

      expect(result.success).toBe(false);
      expect(result.error).toContain('timeout');
    }, 5000);

    it('should use workingDir if specified', async () => {
      // maxLength raised: default 32 would truncate the temp path before we can assert
      const result = await executePluginCommand(makeConfig({ command: 'pwd', workingDir: tempDir, maxLength: 256 }));

      expect(result.success).toBe(true);
      // realpathSync resolves macOS /tmp → /private/tmp symlink
      expect(result.value).toBe(realpathSync(tempDir));
    });

    it('should handle command not found', async () => {
      const result = await executePluginCommand(makeConfig({ command: 'nonexistentcommand12345' }));

      expect(result.success).toBe(false);
      expect(result.error).not.toBeNull();
    });
  });

  describe('updatePluginCaches', () => {
    it('should update cache for plugins that need refresh', async () => {
      const configs = [
        makeConfig({ id: 'plugin1', command: 'echo value1' }),
        makeConfig({ id: 'plugin2', command: 'echo value2' }),
      ];

      await updatePluginCaches(configs, tempDir);

      const cache1Path = join(pluginCacheDir, 'plugin1.json');
      const cache2Path = join(pluginCacheDir, 'plugin2.json');
      expect(existsSync(cache1Path)).toBe(true);
      expect(existsSync(cache2Path)).toBe(true);
      expect(JSON.parse(readFileSync(cache1Path, 'utf-8')).value).toBe('value1');
    });

    it('should include sessionId when refreshOn is session_start', async () => {
      const configs = [
        makeConfig({ id: 'plugin1', command: 'echo value1', ttl: 0, refreshOn: 'session_start' }),
      ];

      await updatePluginCaches(configs, tempDir);

      const cached = JSON.parse(readFileSync(join(pluginCacheDir, 'plugin1.json'), 'utf-8'));
      expect(cached.sessionId).toBe(CURRENT_SESSION_ID);
    });

    it('should skip plugins that do not need refresh', async () => {
      mkdirSync(pluginCacheDir, { recursive: true });
      writeFileSync(
        join(pluginCacheDir, 'plugin1.json'),
        JSON.stringify({ value: 'cached', updatedAt: new Date().toISOString(), error: null })
      );

      // TTL of 1 hour — cache is fresh, so the command should not re-execute
      await updatePluginCaches([makeConfig({ id: 'plugin1', command: 'echo new-value', ttl: 3600 })], tempDir);

      const cached = JSON.parse(readFileSync(join(pluginCacheDir, 'plugin1.json'), 'utf-8'));
      expect(cached.value).toBe('cached');
    });

    it('should handle errors gracefully and continue with other plugins', async () => {
      const configs = [
        makeConfig({ id: 'plugin1', command: 'exit 1' }),
        makeConfig({ id: 'plugin2', command: 'echo success' }),
      ];

      await updatePluginCaches(configs, tempDir);

      const cache1 = JSON.parse(readFileSync(join(pluginCacheDir, 'plugin1.json'), 'utf-8'));
      const cache2 = JSON.parse(readFileSync(join(pluginCacheDir, 'plugin2.json'), 'utf-8'));
      expect(cache1.error).not.toBeNull();
      expect(cache2.value).toBe('success');
    });
  });
});
