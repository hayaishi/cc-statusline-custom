import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { assertSingleLine } from '../helpers/assertions.js';

describe('--update-cache integration', () => {
  const distPath = join(process.cwd(), 'dist', 'index.js');
  const testCacheDir = join(tmpdir(), `ccusage-statusline-update-cache-test-${String(process.pid)}`);
  const updaterMocksUrl = pathToFileURL(
    join(process.cwd(), 'tests', 'helpers', 'updater-mocks.mjs')
  ).href;

  beforeAll(() => {
    // Ensure project is built
    if (!existsSync(distPath)) {
      execSync('npm run build', { stdio: 'inherit' });
    }
  });

  beforeEach(() => {
    if (!existsSync(testCacheDir)) {
      mkdirSync(testCacheDir, { recursive: true });
    }
  });

  afterEach(() => {
    if (existsSync(testCacheDir)) {
      rmSync(testCacheDir, { recursive: true, force: true });
    }
  });

  /**
   * Runs the CLI with --update-cache flag.
   */
  function runUpdateCache(env: Record<string, string> = {}): { stdout: string; exitCode: number } {
    try {
      const nodeOptions = [process.env.NODE_OPTIONS, `--import ${updaterMocksUrl}`]
        .filter(Boolean)
        .join(' ');
      const stdout = execSync(`node ${distPath} --update-cache`, {
        encoding: 'utf-8',
        env: {
          ...process.env,
          NODE_OPTIONS: nodeOptions,
          CCSTATUSLINE_CACHE_DIR: testCacheDir,
          ...env,
        },
        timeout: 5000,
      });
      return { stdout: stdout, exitCode: 0 };
    } catch (error) {
      const execError = error as { stdout?: string; status?: number };
      return {
        stdout: (execError.stdout ?? ''),
        exitCode: execError.status ?? 1,
      };
    }
  }

  it('exits with code 0', () => {
    const { exitCode } = runUpdateCache();
    expect(exitCode).toBe(0);
  });

  it('produces a visible single line output', () => {
    const { stdout } = runUpdateCache();
    const cleanOutput = assertSingleLine(stdout);
    expect(cleanOutput.length).toBeGreaterThan(0);
  });

  it('outputs success message on successful update', () => {
    const { stdout } = runUpdateCache();
    const cleanOutput = assertSingleLine(stdout);
    expect(cleanOutput).toContain('Cache updated');
  });

  it('creates only subscription-usage.json', () => {
    runUpdateCache();

    expect(existsSync(join(testCacheDir, 'subscription-usage.json'))).toBe(true);

    const entries = readdirSync(testCacheDir, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .filter((name) => name !== 'cache.lock');

    expect(entries.sort()).toEqual(['subscription-usage.json']);
  });

  it('uses mocked OAuth usage in subscription-usage.json', () => {
    runUpdateCache();

    const content = readFileSync(join(testCacheDir, 'subscription-usage.json'), 'utf-8');
    const parsed = JSON.parse(content) as { utilizationPercent?: number; resetsAt?: string };

    expect(parsed.utilizationPercent).toBe(55);
    expect(parsed.resetsAt).toBe('2026-01-20T15:45:00Z');
  });

  it('removes lock file after completion', () => {
    runUpdateCache();

    const lockPath = join(testCacheDir, 'cache.lock');
    expect(existsSync(lockPath)).toBe(false);
  });

  it('outputs error message when lock is held', () => {
    // Create a fresh lock file to simulate another process holding it
    const lockPath = join(testCacheDir, 'cache.lock');
    writeFileSync(lockPath, 'locked');

    const { stdout, exitCode } = runUpdateCache();

    // Should still exit 0 (never throws)
    expect(exitCode).toBe(0);

    const cleanOutput = assertSingleLine(stdout);
    // Should contain error message
    expect(cleanOutput).toContain('lock');
  });

  describe('does not affect statusline hot path', () => {
    it('statusline works normally without --update-cache', () => {
      const stdout = execSync(`echo '{}' | node ${distPath}`, {
        encoding: 'utf-8',
        timeout: 5000,
      });
      const cleanOutput = assertSingleLine(stdout);

      // Should produce visible output with context placeholder
      expect(cleanOutput.length).toBeGreaterThan(0);
      expect(cleanOutput).toContain('🧠'); // Context segment placeholder
      expect(cleanOutput).toContain('0%'); // Zero percentage indicator
    });
  });
});
