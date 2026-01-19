import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

describe('--update-cache integration', () => {
  const distPath = join(process.cwd(), 'dist', 'index.js');
  const testCacheDir = join(tmpdir(), `ccusage-statusline-update-cache-test-${String(process.pid)}`);

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
      const stdout = execSync(`node ${distPath} --update-cache`, {
        encoding: 'utf-8',
        env: {
          ...process.env,
          CCUSAGE_CACHE_DIR: testCacheDir,
          ...env,
        },
        timeout: 5000,
      });
      return { stdout: stdout.trim(), exitCode: 0 };
    } catch (error) {
      const execError = error as { stdout?: string; status?: number };
      return {
        stdout: (execError.stdout ?? '').trim(),
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

    // Should not be empty
    expect(stdout.length).toBeGreaterThan(0);

    // Should be a single line
    const lines = stdout.split('\n');
    expect(lines.length).toBe(1);

    // Should not be whitespace-only
    expect(stdout.trim()).not.toBe('');
  });

  it('outputs success message on successful update', () => {
    const { stdout } = runUpdateCache();
    expect(stdout).toContain('Cache updated');
  });

  it('creates cache files', () => {
    runUpdateCache();

    expect(existsSync(join(testCacheDir, 'daily-total.json'))).toBe(true);
    expect(existsSync(join(testCacheDir, 'block-info.json'))).toBe(true);
    expect(existsSync(join(testCacheDir, 'burn-rate.json'))).toBe(true);
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

    // Should contain error message
    expect(stdout).toContain('lock');
  });

  describe('does not affect statusline hot path', () => {
    it('statusline works normally without --update-cache', () => {
      const stdout = execSync(`echo '{}' | node ${distPath}`, {
        encoding: 'utf-8',
        timeout: 5000,
      }).trim();

      // Should produce visible output (fallback in bootstrap phase)
      expect(stdout.length).toBeGreaterThan(0);
      expect(stdout).toContain('?'); // Fallback contains '?'
    });
  });
});
