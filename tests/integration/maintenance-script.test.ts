import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '../..');
const SCRIPT_PATH = join(PROJECT_ROOT, 'scripts', 'maintenance.sh');
const TMP_ROOT = join(PROJECT_ROOT, '.tmp', 'maintenance-test');

describe('maintenance script', () => {
  it('creates cache dir with safe permissions', () => {
    mkdirSync(TMP_ROOT, { recursive: true });
    const cacheDir = mkdtempSync(join(TMP_ROOT, 'cache-'));
    rmSync(cacheDir, { recursive: true, force: true });

    const env = {
      ...process.env,
      CCSTATUSLINE_CACHE_DIR: cacheDir,
      CCSTATUSLINE_BOOTSTRAP: '0',
    };

    execFileSync(SCRIPT_PATH, {
      cwd: PROJECT_ROOT,
      env,
      stdio: 'pipe',
    });

    expect(existsSync(cacheDir)).toBe(true);
    const mode = statSync(cacheDir).mode & 0o777;
    expect(mode).toBe(0o700);

    rmSync(cacheDir, { recursive: true, force: true });
  });
});
