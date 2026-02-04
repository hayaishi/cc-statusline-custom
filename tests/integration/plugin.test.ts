import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, existsSync, readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const PROJECT_ROOT = join(import.meta.dirname, '..', '..');
const SCRIPT_PATH = join(PROJECT_ROOT, 'dist', 'index.js');

describe('Plugin Integration Tests', () => {
  let tempDir: string;
  let cacheDir: string;
  let configPath: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'plugin-integration-test-'));
    cacheDir = join(tempDir, 'cache');
    configPath = join(tempDir, 'plugins.yaml');
    mkdirSync(cacheDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  const sampleInput = JSON.stringify({
    model: { display_name: 'Claude Opus 4.5' },
    cost: { total_cost_usd: 0.23 },
    context_window: {
      used_percentage: 42,
      context_window_size: 200000,
      current_usage: 84000,
    },
  });

  describe('--config flag', () => {
    it('should load plugin config and include plugin segment in output', () => {
      // Create a simple plugin config
      writeFileSync(
        configPath,
        `
plugins:
  - id: test_echo
    command: echo "test-value"
    emoji: "🧪"
    ttl: 60
`
      );

      // Pre-populate plugin cache
      const pluginCacheDir = join(cacheDir, 'plugins');
      mkdirSync(pluginCacheDir, { recursive: true });
      writeFileSync(
        join(pluginCacheDir, 'test_echo.json'),
        JSON.stringify({
          value: 'cached-value',
          updatedAt: new Date().toISOString(),
          error: null,
        })
      );

      const result = spawnSync(
        process.execPath,
        [
          SCRIPT_PATH,
          '--config', configPath,
          '--segments', 'model,plugin:test_echo',
        ],
        {
          input: sampleInput,
          encoding: 'utf-8',
          env: {
            ...process.env,
            CCSTATUSLINE_CACHE_DIR: cacheDir,
            CCSTATUSLINE_NO_EMOJIS: undefined,
          },
        }
      );

      expect(result.status).toBe(0);
      const output = result.stdout.trim();
      expect(output).toContain('Opus');
      expect(output).toContain('cached-value');
      expect(output).toContain('🧪');
    });

    it('should show fallback value when plugin cache is missing', () => {
      writeFileSync(
        configPath,
        `
plugins:
  - id: missing_cache
    command: echo "value"
    emoji: "❓"
    fallbackValue: "N/A"
    ttl: 60
`
      );

      const result = spawnSync(
        process.execPath,
        [
          SCRIPT_PATH,
          '--config', configPath,
          '--segments', 'model,plugin:missing_cache',
        ],
        {
          input: sampleInput,
          encoding: 'utf-8',
          env: {
            ...process.env,
            CCSTATUSLINE_CACHE_DIR: cacheDir,
          },
        }
      );

      expect(result.status).toBe(0);
      const output = result.stdout.trim();
      expect(output).toContain('N/A');
    });

    it('should use fallbackText when --no-emojis is set', () => {
      writeFileSync(
        configPath,
        `
plugins:
  - id: branch
    command: echo "main"
    emoji: "🌿"
    fallbackText: "branch"
    ttl: 60
`
      );

      // Pre-populate cache
      const pluginCacheDir = join(cacheDir, 'plugins');
      mkdirSync(pluginCacheDir, { recursive: true });
      writeFileSync(
        join(pluginCacheDir, 'branch.json'),
        JSON.stringify({
          value: 'main',
          updatedAt: new Date().toISOString(),
          error: null,
        })
      );

      const result = spawnSync(
        process.execPath,
        [
          SCRIPT_PATH,
          '--config', configPath,
          '--segments', 'model,plugin:branch',
          '--no-emojis',
        ],
        {
          input: sampleInput,
          encoding: 'utf-8',
          env: {
            ...process.env,
            CCSTATUSLINE_CACHE_DIR: cacheDir,
          },
        }
      );

      expect(result.status).toBe(0);
      const output = result.stdout.trim();
      expect(output).toContain('branch: main');
      expect(output).not.toContain('🌿');
    });

    it('should ignore non-existent config file gracefully', () => {
      const result = spawnSync(
        process.execPath,
        [
          SCRIPT_PATH,
          '--config', '/nonexistent/path.yaml',
          '--segments', 'model',
        ],
        {
          input: sampleInput,
          encoding: 'utf-8',
          env: {
            ...process.env,
            CCSTATUSLINE_CACHE_DIR: cacheDir,
          },
        }
      );

      expect(result.status).toBe(0);
      const output = result.stdout.trim();
      expect(output).toContain('Opus');
    });

    it('should handle multiple plugins in correct order', () => {
      writeFileSync(
        configPath,
        `
plugins:
  - id: first
    command: echo "1"
    emoji: "1️⃣"
    ttl: 60
  - id: second
    command: echo "2"
    emoji: "2️⃣"
    ttl: 60
`
      );

      // Pre-populate caches
      const pluginCacheDir = join(cacheDir, 'plugins');
      mkdirSync(pluginCacheDir, { recursive: true });
      writeFileSync(
        join(pluginCacheDir, 'first.json'),
        JSON.stringify({ value: 'A', updatedAt: new Date().toISOString(), error: null })
      );
      writeFileSync(
        join(pluginCacheDir, 'second.json'),
        JSON.stringify({ value: 'B', updatedAt: new Date().toISOString(), error: null })
      );

      const result = spawnSync(
        process.execPath,
        [
          SCRIPT_PATH,
          '--config', configPath,
          '--segments', 'plugin:first,model,plugin:second',
        ],
        {
          input: sampleInput,
          encoding: 'utf-8',
          env: {
            ...process.env,
            CCSTATUSLINE_CACHE_DIR: cacheDir,
          },
        }
      );

      expect(result.status).toBe(0);
      const output = result.stdout.trim();
      // Check order: first plugin, model, second plugin
      const firstIdx = output.indexOf('A');
      const modelIdx = output.indexOf('Opus');
      const secondIdx = output.indexOf('B');
      expect(firstIdx).toBeLessThan(modelIdx);
      expect(modelIdx).toBeLessThan(secondIdx);
    });
  });

  describe('--update-cache with plugins', () => {
    it('should update plugin caches when --config is provided', async () => {
      writeFileSync(
        configPath,
        `
plugins:
  - id: echo_test
    command: echo "updated"
    ttl: 60
`
      );

      const result = spawnSync(
        process.execPath,
        [
          SCRIPT_PATH,
          '--update-cache',
          '--config', configPath,
        ],
        {
          encoding: 'utf-8',
          env: {
            ...process.env,
            CCSTATUSLINE_CACHE_DIR: cacheDir,
          },
          timeout: 10000,
        }
      );

      expect(result.status).toBe(0);

      // Check that plugin cache was created
      const pluginCachePath = join(cacheDir, 'plugins', 'echo_test.json');
      expect(existsSync(pluginCachePath)).toBe(true);

      const cached = JSON.parse(readFileSync(pluginCachePath, 'utf-8'));
      expect(cached.value).toBe('updated');
      expect(cached.error).toBeNull();
    });
  });

  describe('plugin cache TTL behavior', () => {
    it('should use cached value when cache is fresh', () => {
      writeFileSync(
        configPath,
        `
plugins:
  - id: cached
    command: echo "new-value"
    ttl: 3600
`
      );

      // Pre-populate with fresh cache
      const pluginCacheDir = join(cacheDir, 'plugins');
      mkdirSync(pluginCacheDir, { recursive: true });
      writeFileSync(
        join(pluginCacheDir, 'cached.json'),
        JSON.stringify({
          value: 'old-value',
          updatedAt: new Date().toISOString(),
          error: null,
        })
      );

      const result = spawnSync(
        process.execPath,
        [
          SCRIPT_PATH,
          '--config', configPath,
          '--segments', 'plugin:cached',
        ],
        {
          input: sampleInput,
          encoding: 'utf-8',
          env: {
            ...process.env,
            CCSTATUSLINE_CACHE_DIR: cacheDir,
          },
        }
      );

      expect(result.status).toBe(0);
      // Should show cached value, not new value from command
      expect(result.stdout).toContain('old-value');
    });
  });
});
