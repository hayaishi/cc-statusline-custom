import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync, spawn } from 'node:child_process';
import { join } from 'node:path';
import { existsSync, mkdirSync, rmSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { assertSingleLine } from '../helpers/assertions.js';

describe('--update-cache integration', () => {
  const distPath = join(process.cwd(), 'dist', 'index.js');
  const testCacheDir = join(tmpdir(), `cc-statusline-custom-update-cache-test-${String(process.pid)}`);

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

  function runUpdateCache(env: Record<string, string> = {}, extraArgs: string[] = []): { stdout: string; exitCode: number } {
    try {
      const args = ['--update-cache', ...extraArgs].join(' ');
      const stdout = execSync(`node ${distPath} ${args}`, {
        encoding: 'utf-8',
        env: {
          ...process.env,
          CCSTATUSLINE_CACHE_DIR: testCacheDir,
          ...env,
        },
        timeout: 5000,
      });
      return { stdout, exitCode: 0 };
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

  it('outputs success message', () => {
    const { stdout } = runUpdateCache();
    const cleanOutput = assertSingleLine(stdout);
    expect(cleanOutput).toContain('Cache updated');
  });

  it('does not create subscription-usage.json', () => {
    runUpdateCache();
    expect(existsSync(join(testCacheDir, 'subscription-usage.json'))).toBe(false);
  });

  it('creates no unexpected cache files when no plugins configured', () => {
    runUpdateCache();

    if (!existsSync(testCacheDir)) return;

    const entries = readdirSync(testCacheDir, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name);

    expect(entries).toEqual([]);
  });

  it('creates a lock file while updating a slow plugin cache', async () => {
    const configFile = join(testCacheDir, 'plugins.yml');
    writeFileSync(configFile, `plugins:
  - id: slow
    command: sleep 1
    ttl: 0
`);

    const lockPath = join(testCacheDir, 'cache.lock');
    const child = spawn(
      'node',
      [distPath, '--update-cache', '--config', configFile, '--segments', ':slow'],
      {
        env: { ...process.env, CCSTATUSLINE_CACHE_DIR: testCacheDir },
        stdio: 'ignore',
      }
    );

    // Give the process ~200ms to start and acquire the lock
    await new Promise<void>(resolve => setTimeout(resolve, 200));
    expect(existsSync(lockPath)).toBe(true);

    await new Promise<void>(resolve => child.on('close', resolve));
  });

  it('skips update and does not release lock when another updater holds it', () => {
    const lockPath = join(testCacheDir, 'cache.lock');
    // Simulate a fresh lock held by another process
    mkdirSync(testCacheDir, { recursive: true });
    writeFileSync(lockPath, String(process.pid));

    const { stdout } = runUpdateCache();

    // Lock must still exist — the second updater must not have removed it
    expect(existsSync(lockPath)).toBe(true);
    // Output must still be a single visible line
    assertSingleLine(stdout);
  });

  describe('does not affect statusline hot path', () => {
    it('statusline works normally without --update-cache', () => {
      const stdout = execSync(`echo '{}' | node ${distPath}`, {
        encoding: 'utf-8',
        timeout: 5000,
      });
      const cleanOutput = assertSingleLine(stdout);
      expect(cleanOutput.length).toBeGreaterThan(0);
    });
  });
});
