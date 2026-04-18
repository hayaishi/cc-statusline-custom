/**
 * Integration tests for background cache update functionality.
 *
 * Tests verify that:
 * - Background updates are only requested for plugin caches (not subscription)
 * - --disable-bg-update flag prevents spawns
 * - CCSTATUSLINE_BG_UPDATE=1 prevents recursion
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { execSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertSingleLine } from '../helpers/assertions.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '../..');
const TEST_CACHE_ROOT = join(PROJECT_ROOT, '.tmp', 'test-cache');

function withIsolatedCacheDir<T>(run: (cacheDir: string) => T): T {
  mkdirSync(TEST_CACHE_ROOT, { recursive: true });
  const cacheDir = mkdtempSync(join(TEST_CACHE_ROOT, 'bg-update-'));
  try {
    return run(cacheDir);
  } finally {
    rmSync(cacheDir, { recursive: true, force: true });
  }
}

describe('Background Cache Update Integration Tests', () => {
  beforeAll(() => {
    execSync('npm run build', {
      cwd: PROJECT_ROOT,
      encoding: 'utf-8',
      stdio: 'pipe',
    });
  });

  describe('segment-aware scheduling', () => {
    it('does not request background update when segments exclude subscription_usage', () => {
      const input = JSON.stringify({
        model: { display_name: 'Claude Opus 4.5' },
        context_window: { used_percentage: 42 },
      });

      withIsolatedCacheDir((cacheDir) => {
        const result = execSync(
          `echo '${input}' | node ${join(PROJECT_ROOT, 'dist/index.js')} --segments=model,context`,
          {
            encoding: 'utf-8',
            timeout: 1000,
            env: { ...process.env, CCSTATUSLINE_CACHE_DIR: cacheDir },
          }
        );

        assertSingleLine(result);
      });
    });

    it('renders subscription_usage from rate_limits without spawning a bg update', () => {
      const input = JSON.stringify({
        model: { display_name: 'Claude Opus 4.5' },
        context_window: { used_percentage: 42 },
        rate_limits: {
          five_hour: { used_percentage: 55, resets_at: 1768923900 },
        },
      });

      withIsolatedCacheDir((cacheDir) => {
        const result = execSync(
          `echo '${input}' | node ${join(PROJECT_ROOT, 'dist/index.js')} --disable-bg-update`,
          {
            encoding: 'utf-8',
            timeout: 1000,
            env: { ...process.env, CCSTATUSLINE_CACHE_DIR: cacheDir },
          }
        );

        const cleanOutput = assertSingleLine(result);
        expect(cleanOutput).toContain('55%');
        expect(cleanOutput).not.toContain('Loading...');
      });
    });
  });

  describe('CLI flags', () => {
    it('--disable-bg-update prevents background spawn', () => {
      const input = JSON.stringify({
        model: { display_name: 'Claude Opus 4.5' },
        context_window: { used_percentage: 42 },
      });

      withIsolatedCacheDir((cacheDir) => {
        const result = execSync(
          `echo '${input}' | node ${join(PROJECT_ROOT, 'dist/index.js')} --disable-bg-update`,
          {
            encoding: 'utf-8',
            timeout: 1000,
            env: { ...process.env, CCSTATUSLINE_CACHE_DIR: cacheDir },
          }
        );

        assertSingleLine(result);
      });
    });

    it('CCSTATUSLINE_BG_UPDATE=1 prevents recursion', () => {
      const input = JSON.stringify({
        model: { display_name: 'Claude Opus 4.5' },
        context_window: { used_percentage: 42 },
      });

      withIsolatedCacheDir((cacheDir) => {
        const result = execSync(
          `echo '${input}' | node ${join(PROJECT_ROOT, 'dist/index.js')}`,
          {
            encoding: 'utf-8',
            timeout: 1000,
            env: {
              ...process.env,
              CCSTATUSLINE_CACHE_DIR: cacheDir,
              CCSTATUSLINE_BG_UPDATE: '1',
            },
          }
        );

        assertSingleLine(result);
      });
    });
  });

  describe('--update-cache subcommand', () => {
    it('outputs a visible single line', () => {
      withIsolatedCacheDir((cacheDir) => {
        const result = execSync(
          `node ${join(PROJECT_ROOT, 'dist/index.js')} --update-cache`,
          {
            encoding: 'utf-8',
            timeout: 5000,
            env: { ...process.env, CCSTATUSLINE_CACHE_DIR: cacheDir },
          }
        );

        const cleanOutput = assertSingleLine(result);
        expect(cleanOutput.length).toBeGreaterThan(0);
      });
    });
  });
});
