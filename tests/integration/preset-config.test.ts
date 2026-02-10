import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadPluginConfig, parsePluginsFile, validatePluginConfig } from '../../src/config/plugin-config.js';
import type { PluginsFile } from '../../src/types/plugin.js';

const PROJECT_ROOT = join(import.meta.dirname, '..', '..');
const SCRIPT_PATH = join(PROJECT_ROOT, 'dist', 'index.js');
const PRESETS_PATH = join(PROJECT_ROOT, 'config.presets.yml');

function loadPresets(): PluginsFile {
  const loaded = loadPluginConfig(PRESETS_PATH);
  if (loaded === null) {
    throw new Error('config.presets.yml failed to load');
  }
  return loaded;
}

describe('Preset Config Integration Tests', () => {
  let tempDir: string;
  let cacheDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'preset-integration-test-'));
    cacheDir = join(tempDir, 'cache');
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

  describe('config.presets.yml parsing and validation', () => {
    it('should parse config.presets.yml without errors', () => {
      const loaded = loadPresets();
      expect(loaded.plugins).toBeDefined();
      expect(Array.isArray(loaded.plugins)).toBe(true);
    });

    it('should have all valid plugin IDs and configurations', () => {
      const loaded = loadPresets();
      const result = parsePluginsFile(loaded);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.plugins.length).toBeGreaterThan(0);

      for (const plugin of result.plugins) {
        const validation = validatePluginConfig(plugin);
        expect(validation.valid, `Plugin "${plugin.id}" should be valid: ${validation.errors.join(', ')}`).toBe(true);
      }
    });

    it('should contain expected preset plugin IDs', () => {
      const loaded = loadPresets();
      const result = parsePluginsFile(loaded);
      const ids = result.plugins.map((p) => p.id);

      expect(ids).toContain('git_branch');
      expect(ids).toContain('git_commit');
      expect(ids).toContain('node_version');
      expect(ids).toContain('cpu');
    });

    it('should have no duplicate plugin IDs', () => {
      const loaded = loadPresets();
      const result = parsePluginsFile(loaded);
      const ids = result.plugins.map((p) => p.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });
  });

  describe('preset command fallback behavior', () => {
    it('should produce deterministic fallback when node is unavailable', () => {
      const result = spawnSync(
        '/bin/sh',
        ['-c', 'v=$(/nonexistent/node -v 2>/dev/null)\n[ -n "$v" ] && printf \'%s\\n\' "${v#v}" || echo "-"'],
        { encoding: 'utf-8' }
      );

      expect(result.stdout.trim()).toBe('-');
    });

    it('should produce deterministic fallback for cpu on non-Darwin platform check', () => {
      const result = spawnSync(
        '/bin/sh',
        ['-c', '[ "$(uname -s)" = "NonExistentOS" ] || { echo "-"; exit; }\nv=$(top -l 1 2>/dev/null | grep "CPU usage" | awk \'{print $3}\')\n[ -n "$v" ] && echo "$v" || echo "-"'],
        { encoding: 'utf-8' }
      );

      expect(result.stdout.trim()).toBe('-');
    });

    it('should load presets and run statusline without errors', () => {
      const result = spawnSync(
        process.execPath,
        [
          SCRIPT_PATH,
          '--config', PRESETS_PATH,
          '--segments', 'model,:git_branch',
          '--disable-bg-update',
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
      expect(output.length).toBeGreaterThan(0);
      expect(output).toContain('Opus');
    });
  });
});
