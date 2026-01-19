import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { execSync, execFileSync, type ExecSyncOptions } from 'node:child_process';
import { readFileSync, accessSync, constants, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '../..');
const CLI_PATH = join(PROJECT_ROOT, 'dist/index.js');
const FIXTURE_PATH = join(PROJECT_ROOT, 'tests/fixtures/claude-code-input.json');

/**
 * Helper to run the CLI with given stdin input.
 * Returns stdout output and exit code.
 */
function runCli(
  stdin: string,
  options?: { timeout?: number }
): { stdout: string; exitCode: number } {
  const execOptions: ExecSyncOptions = {
    input: stdin,
    encoding: 'utf-8',
    cwd: PROJECT_ROOT,
    timeout: options?.timeout ?? 5000,
    stdio: ['pipe', 'pipe', 'pipe'],
  };

  try {
    const stdout = execSync(`node ${CLI_PATH}`, execOptions);
    return { stdout: String(stdout), exitCode: 0 };
  } catch (error) {
    // execSync throws on non-zero exit
    const execError = error as { status?: number; stdout?: Buffer | string };
    return {
      stdout: String(execError.stdout ?? ''),
      exitCode: execError.status ?? 1,
    };
  }
}

/**
 * Helper to count lines in output.
 * Note: console.log adds a trailing newline, so "x\n" is 1 line with content.
 */
function countOutputLines(output: string): number {
  // Remove trailing newline added by console.log, then count
  const trimmed = output.replace(/\n$/, '');
  if (trimmed === '') {
    return 0; // Empty output is ZERO lines - violates NEVER silent
  }
  return trimmed.split('\n').length;
}

/**
 * Helper to check if output is visible (non-empty after trim).
 */
function isVisibleOutput(output: string): boolean {
  return output.replace(/\n$/, '').trim().length > 0;
}

/**
 * Helper to run the CLI via direct execution (not via node).
 * Tests shebang and execute permissions.
 */
function runCliDirect(
  stdin: string,
  options?: { timeout?: number }
): { stdout: string; exitCode: number } {
  try {
    const stdout = execFileSync(CLI_PATH, [], {
      input: stdin,
      encoding: 'utf-8',
      cwd: PROJECT_ROOT,
      timeout: options?.timeout ?? 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { stdout, exitCode: 0 };
  } catch (error) {
    const execError = error as { status?: number; stdout?: Buffer | string };
    return {
      stdout: String(execError.stdout ?? ''),
      exitCode: execError.status ?? 1,
    };
  }
}

describe('CLI Integration Tests', () => {
  beforeAll(() => {
    // Ensure the project is built before running integration tests
    try {
      execSync('npm run build', {
        cwd: PROJECT_ROOT,
        encoding: 'utf-8',
        stdio: 'pipe',
      });
    } catch (error) {
      throw new Error(
        `Build failed. Run 'npm run build' first. Error: ${String(error)}`
      );
    }
  });

  describe('NEVER silent - always outputs visible content', () => {
    it('outputs exactly one visible line for empty stdin', () => {
      const { stdout, exitCode } = runCli('');
      expect(exitCode).toBe(0);
      expect(countOutputLines(stdout)).toBe(1);
      expect(isVisibleOutput(stdout)).toBe(true);
    });

    it('outputs exactly one visible line for invalid JSON', () => {
      const { stdout, exitCode } = runCli('not valid json');
      expect(exitCode).toBe(0);
      expect(countOutputLines(stdout)).toBe(1);
      expect(isVisibleOutput(stdout)).toBe(true);
    });

    it('outputs exactly one visible line for valid empty object', () => {
      const { stdout, exitCode } = runCli('{}');
      expect(exitCode).toBe(0);
      expect(countOutputLines(stdout)).toBe(1);
      expect(isVisibleOutput(stdout)).toBe(true);
    });

    it('outputs exactly one visible line for fixture input', () => {
      const fixture = readFileSync(FIXTURE_PATH, 'utf-8');
      const { stdout, exitCode } = runCli(fixture);
      expect(exitCode).toBe(0);
      expect(countOutputLines(stdout)).toBe(1);
      expect(isVisibleOutput(stdout)).toBe(true);
    });

    it('rejects invisible output (would fail if output were empty)', () => {
      // This test documents the NEVER silent requirement
      // If generateStatusline returned '' this would fail
      const testInputs = ['', 'invalid', '{}', 'null', '[]'];
      for (const input of testInputs) {
        const { stdout } = runCli(input);
        expect(isVisibleOutput(stdout)).toBe(true);
      }
    });
  });

  describe('exit code', () => {
    it('always exits with code 0 for empty input', () => {
      const { exitCode } = runCli('');
      expect(exitCode).toBe(0);
    });

    it('always exits with code 0 for invalid input', () => {
      const { exitCode } = runCli('garbage');
      expect(exitCode).toBe(0);
    });

    it('always exits with code 0 for valid input', () => {
      const fixture = readFileSync(FIXTURE_PATH, 'utf-8');
      const { exitCode } = runCli(fixture);
      expect(exitCode).toBe(0);
    });
  });

  describe('performance', () => {
    it('completes within 300ms', () => {
      const start = performance.now();
      runCli('{}', { timeout: 1000 });
      const duration = performance.now() - start;

      // Allow some margin for test environment variance
      expect(duration).toBeLessThan(300);
    });
  });

  describe('edge cases', () => {
    it('handles null JSON value with visible output', () => {
      const { stdout, exitCode } = runCli('null');
      expect(exitCode).toBe(0);
      expect(countOutputLines(stdout)).toBe(1);
      expect(isVisibleOutput(stdout)).toBe(true);
    });

    it('handles array JSON value with visible output', () => {
      const { stdout, exitCode } = runCli('[1, 2, 3]');
      expect(exitCode).toBe(0);
      expect(countOutputLines(stdout)).toBe(1);
      expect(isVisibleOutput(stdout)).toBe(true);
    });

    it('handles very large input with visible output', () => {
      const largeInput = JSON.stringify({
        model: 'test',
        // Create a large payload
        data: 'x'.repeat(10000),
      });
      const { stdout, exitCode } = runCli(largeInput);
      expect(exitCode).toBe(0);
      expect(countOutputLines(stdout)).toBe(1);
      expect(isVisibleOutput(stdout)).toBe(true);
    });

    it('handles unicode input with visible output', () => {
      const unicodeInput = JSON.stringify({
        model: 'claude-3-opus',
        note: 'Test with emojis: 🤖💰🔥🧠',
      });
      const { stdout, exitCode } = runCli(unicodeInput);
      expect(exitCode).toBe(0);
      expect(countOutputLines(stdout)).toBe(1);
      expect(isVisibleOutput(stdout)).toBe(true);
    });
  });

  describe('full Claude Code schema', () => {
    it('formats complete nested schema as "Model | $Cost | Usage%"', () => {
      const input = JSON.stringify({
        hook_event_name: 'Status',
        session_id: 'test-123',
        model: {
          id: 'claude-opus-4-5-20251101',
          display_name: 'Claude Opus 4.5',
        },
        cost: {
          total_cost_usd: 0.23,
          total_duration_ms: 45000,
        },
        context_window: {
          used_percentage: 42,
          remaining_percentage: 58,
        },
      });
      const { stdout, exitCode } = runCli(input);
      expect(exitCode).toBe(0);
      expect(stdout.trim()).toBe('Opus | $0.23 | 42%');
    });

    it('formats partial schema (model only)', () => {
      const input = JSON.stringify({
        model: { display_name: 'Claude Sonnet 4' },
      });
      const { stdout, exitCode } = runCli(input);
      expect(exitCode).toBe(0);
      expect(stdout.trim()).toBe('Sonnet');
    });

    it('formats partial schema (model + cost)', () => {
      const input = JSON.stringify({
        model: { display_name: 'Claude Haiku' },
        cost: { total_cost_usd: 0.01 },
      });
      const { stdout, exitCode } = runCli(input);
      expect(exitCode).toBe(0);
      expect(stdout.trim()).toBe('Haiku | $0.01');
    });

    it('formats backward-compatible flat schema', () => {
      const input = JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        cost_usd: 0.15,
        context_window: { used_percentage: 25 },
      });
      const { stdout, exitCode } = runCli(input);
      expect(exitCode).toBe(0);
      expect(stdout.trim()).toBe('Sonnet | $0.15 | 25%');
    });
  });

  describe('graceful degradation', () => {
    it('returns fallback for missing model', () => {
      const input = JSON.stringify({
        cost: { total_cost_usd: 0.50 },
      });
      const { stdout, exitCode } = runCli(input);
      expect(exitCode).toBe(0);
      // Only cost, so output is just cost
      expect(stdout.trim()).toBe('$0.50');
    });

    it('handles invalid cost gracefully', () => {
      const input = JSON.stringify({
        model: { display_name: 'Claude Opus 4.5' },
        cost: { total_cost_usd: NaN },
      });
      const { stdout, exitCode } = runCli(input);
      expect(exitCode).toBe(0);
      // Only model is valid
      expect(stdout.trim()).toBe('Opus');
    });

    it('handles missing context_window gracefully', () => {
      const input = JSON.stringify({
        model: { display_name: 'Claude Opus 4.5' },
        cost: { total_cost_usd: 0.23 },
      });
      const { stdout, exitCode } = runCli(input);
      expect(exitCode).toBe(0);
      expect(stdout.trim()).toBe('Opus | $0.23');
    });
  });

  describe('direct execution (shebang + permissions)', () => {
    it('has execute permissions on dist/index.js', () => {
      // Verify file has execute bit set
      expect(() => {
        accessSync(CLI_PATH, constants.X_OK);
      }).not.toThrow();
    });

    it('dist/index.js starts with a shebang for direct execution', () => {
      const contents = readFileSync(CLI_PATH, 'utf-8');
      const normalized = contents.replace(/^\uFEFF/, '');
      expect(normalized.startsWith('#!')).toBe(true);
    });

    it('executes directly without node prefix', () => {
      const { stdout, exitCode } = runCliDirect('{}');
      expect(exitCode).toBe(0);
      expect(countOutputLines(stdout)).toBe(1);
      expect(isVisibleOutput(stdout)).toBe(true);
    });

    it('handles empty input via direct execution', () => {
      const { stdout, exitCode } = runCliDirect('');
      expect(exitCode).toBe(0);
      expect(countOutputLines(stdout)).toBe(1);
      expect(isVisibleOutput(stdout)).toBe(true);
    });

    it('handles invalid JSON via direct execution', () => {
      const { stdout, exitCode } = runCliDirect('not json');
      expect(exitCode).toBe(0);
      expect(countOutputLines(stdout)).toBe(1);
      expect(isVisibleOutput(stdout)).toBe(true);
    });

    it('produces same output as node invocation', () => {
      const testInputs = ['', '{}', 'invalid', 'null'];
      for (const input of testInputs) {
        const nodeResult = runCli(input);
        const directResult = runCliDirect(input);
        expect(directResult.stdout).toBe(nodeResult.stdout);
        expect(directResult.exitCode).toBe(nodeResult.exitCode);
      }
    });
  });

  describe('extended metrics (CCUSAGE_EXTENDED_METRICS)', () => {
    const testCacheDir = join(tmpdir(), `ccusage-int-test-${String(process.pid)}`);

    afterEach(() => {
      if (existsSync(testCacheDir)) {
        rmSync(testCacheDir, { recursive: true, force: true });
      }
    });

    it('includes daily total and burn rate when extended metrics enabled', () => {
      // Create test cache directory
      mkdirSync(testCacheDir, { recursive: true });

      // Write fresh cache entries
      writeFileSync(
        join(testCacheDir, 'daily-total.json'),
        JSON.stringify({
          cost_usd: 2.50,
          date: new Date().toISOString().slice(0, 10),
          updated_at: Date.now(),
        })
      );
      writeFileSync(
        join(testCacheDir, 'burn-rate.json'),
        JSON.stringify({
          rate_per_hour: 0.25,
          updated_at: Date.now(),
        })
      );

      const input = JSON.stringify({
        model: { display_name: 'Claude Opus 4.5' },
        cost: { total_cost_usd: 0.23 },
        context_window: { used_percentage: 42 },
      });

      // Run CLI with extended metrics enabled
      const result = execSync(
        `echo '${input}' | CCUSAGE_EXTENDED_METRICS=true CCUSAGE_CACHE_DIR="${testCacheDir}" node ${CLI_PATH}`,
        {
          encoding: 'utf-8',
          timeout: 5000,
        }
      );

      expect(result.trim()).toBe('Opus | $0.23 | 42% | $2.50 today | $0.25/hr');
    });

    it('falls back to fast-path when extended metrics enabled but cache missing', () => {
      // Ensure test cache directory doesn't exist
      if (existsSync(testCacheDir)) {
        rmSync(testCacheDir, { recursive: true, force: true });
      }

      const input = JSON.stringify({
        model: { display_name: 'Claude Opus 4.5' },
        cost: { total_cost_usd: 0.23 },
        context_window: { used_percentage: 42 },
      });

      // Run CLI with extended metrics enabled but no cache
      const result = execSync(
        `echo '${input}' | CCUSAGE_EXTENDED_METRICS=true CCUSAGE_CACHE_DIR="${testCacheDir}" node ${CLI_PATH}`,
        {
          encoding: 'utf-8',
          timeout: 5000,
        }
      );

      // Should still produce fast-path output
      expect(result.trim()).toBe('Opus | $0.23 | 42%');
    });

    it('uses fast-path only when extended metrics disabled (default)', () => {
      // Create test cache directory with cache entries
      mkdirSync(testCacheDir, { recursive: true });
      writeFileSync(
        join(testCacheDir, 'daily-total.json'),
        JSON.stringify({
          cost_usd: 2.50,
          date: new Date().toISOString().slice(0, 10),
          updated_at: Date.now(),
        })
      );

      const input = JSON.stringify({
        model: { display_name: 'Claude Opus 4.5' },
        cost: { total_cost_usd: 0.23 },
        context_window: { used_percentage: 42 },
      });

      // Run CLI without extended metrics (default)
      const result = execSync(
        `echo '${input}' | CCUSAGE_CACHE_DIR="${testCacheDir}" node ${CLI_PATH}`,
        {
          encoding: 'utf-8',
          timeout: 5000,
        }
      );

      // Should NOT include daily total
      expect(result.trim()).toBe('Opus | $0.23 | 42%');
    });
  });
});
