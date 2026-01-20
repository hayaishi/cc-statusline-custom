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
 * Strip ANSI escape codes from a string.
 */
function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1b\[[0-9;]*m/g, '');
}

/**
 * Helper to run the CLI with given stdin input.
 * Returns stdout output and exit code.
 */
function runCli(
  stdin: string,
  options?: { timeout?: number; env?: Record<string, string> }
): { stdout: string; exitCode: number } {
  const execOptions: ExecSyncOptions = {
    input: stdin,
    encoding: 'utf-8',
    cwd: PROJECT_ROOT,
    timeout: options?.timeout ?? 5000,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, ...options?.env },
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
 * Helper to assert single-line guarantee without relying on trim().
 * - Strips ANSI escape codes
 * - Removes only ONE trailing newline (from console.log)
 * - Asserts no remaining newlines exist
 * - Returns the clean output for further assertions
 */
function assertSingleLine(output: string): string {
  const stripped = stripAnsi(output);
  // Remove only one trailing newline (added by console.log)
  const withoutTrailing = stripped.replace(/\n$/, '');
  // Assert no embedded newlines remain
  expect(withoutTrailing).not.toContain('\n');
  return withoutTrailing;
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
      const cleanOutput = assertSingleLine(stdout);
      expect(cleanOutput.length).toBeGreaterThan(0);
    });

    it('outputs exactly one visible line for invalid JSON', () => {
      const { stdout, exitCode } = runCli('not valid json');
      expect(exitCode).toBe(0);
      const cleanOutput = assertSingleLine(stdout);
      expect(cleanOutput.length).toBeGreaterThan(0);
    });

    it('outputs exactly one visible line for valid empty object', () => {
      const { stdout, exitCode } = runCli('{}');
      expect(exitCode).toBe(0);
      const cleanOutput = assertSingleLine(stdout);
      expect(cleanOutput.length).toBeGreaterThan(0);
    });

    it('outputs exactly one visible line for fixture input', () => {
      const fixture = readFileSync(FIXTURE_PATH, 'utf-8');
      const { stdout, exitCode } = runCli(fixture);
      expect(exitCode).toBe(0);
      const cleanOutput = assertSingleLine(stdout);
      expect(cleanOutput.length).toBeGreaterThan(0);
    });

    it('rejects invisible output (would fail if output were empty)', () => {
      // This test documents the NEVER silent requirement
      // If generateStatusline returned '' this would fail
      const testInputs = ['', 'invalid', '{}', 'null', '[]'];
      for (const input of testInputs) {
        const { stdout } = runCli(input);
        const cleanOutput = assertSingleLine(stdout);
        expect(cleanOutput.length).toBeGreaterThan(0);
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
      const cleanOutput = assertSingleLine(stdout);
      expect(cleanOutput.length).toBeGreaterThan(0);
    });

    it('handles array JSON value with visible output', () => {
      const { stdout, exitCode } = runCli('[1, 2, 3]');
      expect(exitCode).toBe(0);
      const cleanOutput = assertSingleLine(stdout);
      expect(cleanOutput.length).toBeGreaterThan(0);
    });

    it('handles very large input with visible output', () => {
      const largeInput = JSON.stringify({
        model: 'test',
        // Create a large payload
        data: 'x'.repeat(10000),
      });
      const { stdout, exitCode } = runCli(largeInput);
      expect(exitCode).toBe(0);
      const cleanOutput = assertSingleLine(stdout);
      expect(cleanOutput.length).toBeGreaterThan(0);
    });

    it('handles unicode input with visible output', () => {
      const unicodeInput = JSON.stringify({
        model: 'claude-3-opus',
        note: 'Test with emojis: 🤖💰🔥🧠',
      });
      const { stdout, exitCode } = runCli(unicodeInput);
      expect(exitCode).toBe(0);
      const cleanOutput = assertSingleLine(stdout);
      expect(cleanOutput.length).toBeGreaterThan(0);
    });
  });

  describe('new legacy format', () => {
    const testCacheDir = join(tmpdir(), `ccusage-int-format-${String(process.pid)}`);

    afterEach(() => {
      if (existsSync(testCacheDir)) {
        rmSync(testCacheDir, { recursive: true, force: true });
      }
    });

    it('formats complete nested schema with new format', () => {
      // Create empty cache dir to avoid existing cache entries
      mkdirSync(testCacheDir, { recursive: true });

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
          context_window_size: 200000,
          current_usage: {
            input_tokens: 80000,
            output_tokens: 4000,
          },
        },
      });
      const { stdout, exitCode } = runCli(input, { env: { CCUSAGE_CACHE_DIR: testCacheDir } });
      expect(exitCode).toBe(0);
      expect(stripAnsi(stdout.trim())).toBe('🤖 Opus | 💰 $0.23 sess | 🧠 84.0k/200k [███░░░░░] 42%');
    });

    it('formats partial schema (model only)', () => {
      mkdirSync(testCacheDir, { recursive: true });
      const input = JSON.stringify({
        model: { display_name: 'Claude Sonnet 4' },
      });
      const { stdout, exitCode } = runCli(input, { env: { CCUSAGE_CACHE_DIR: testCacheDir } });
      expect(exitCode).toBe(0);
      expect(stripAnsi(stdout.trim())).toBe('🤖 Sonnet');
    });

    it('formats partial schema (model + cost)', () => {
      mkdirSync(testCacheDir, { recursive: true });
      const input = JSON.stringify({
        model: { display_name: 'Claude Haiku' },
        cost: { total_cost_usd: 0.01 },
      });
      const { stdout, exitCode } = runCli(input, { env: { CCUSAGE_CACHE_DIR: testCacheDir } });
      expect(exitCode).toBe(0);
      expect(stripAnsi(stdout.trim())).toBe('🤖 Haiku | 💰 $0.01 sess');
    });

    it('formats backward-compatible flat schema', () => {
      mkdirSync(testCacheDir, { recursive: true });
      const input = JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        cost_usd: 0.15,
        context_window: {
          used_percentage: 25,
          context_window_size: 200000,
          current_usage: { input_tokens: 50000 },
        },
      });
      const { stdout, exitCode } = runCli(input, { env: { CCUSAGE_CACHE_DIR: testCacheDir } });
      expect(exitCode).toBe(0);
      expect(stripAnsi(stdout.trim())).toBe('🤖 Sonnet | 💰 $0.15 sess | 🧠 50.0k/200k [██░░░░░░] 25%');
    });

    it('handles current_usage: null gracefully', () => {
      mkdirSync(testCacheDir, { recursive: true });
      const input = JSON.stringify({
        model: { display_name: 'Claude Opus 4.5' },
        context_window: {
          used_percentage: 0,
          context_window_size: 200000,
          current_usage: null,
        },
      });
      const { stdout, exitCode } = runCli(input, { env: { CCUSAGE_CACHE_DIR: testCacheDir } });
      expect(exitCode).toBe(0);
      const cleanOutput = assertSingleLine(stdout);
      expect(cleanOutput).toBe('🤖 Opus | 🧠 0/200k [░░░░░░░░] 0%');
    });

    it('rounds percentage with .5 up to 43', () => {
      mkdirSync(testCacheDir, { recursive: true });
      const input = JSON.stringify({
        model: { display_name: 'Claude Opus 4.5' },
        context_window: {
          used_percentage: 42.5,
          context_window_size: 200000,
          current_usage: { input_tokens: 85000 },
        },
      });
      const { stdout, exitCode } = runCli(input, { env: { CCUSAGE_CACHE_DIR: testCacheDir } });
      expect(exitCode).toBe(0);
      expect(stripAnsi(stdout.trim())).toContain('43%');
    });
  });

  describe('graceful degradation', () => {
    const testCacheDir = join(tmpdir(), `ccusage-int-degrade-${String(process.pid)}`);

    afterEach(() => {
      if (existsSync(testCacheDir)) {
        rmSync(testCacheDir, { recursive: true, force: true });
      }
    });

    it('returns cost segment for missing model', () => {
      mkdirSync(testCacheDir, { recursive: true });
      const input = JSON.stringify({
        cost: { total_cost_usd: 0.50 },
      });
      const { stdout, exitCode } = runCli(input, { env: { CCUSAGE_CACHE_DIR: testCacheDir } });
      expect(exitCode).toBe(0);
      // Only cost segment
      expect(stripAnsi(stdout.trim())).toBe('💰 $0.50 sess');
    });

    it('handles invalid cost gracefully', () => {
      mkdirSync(testCacheDir, { recursive: true });
      const input = JSON.stringify({
        model: { display_name: 'Claude Opus 4.5' },
        cost: { total_cost_usd: NaN },
      });
      const { stdout, exitCode } = runCli(input, { env: { CCUSAGE_CACHE_DIR: testCacheDir } });
      expect(exitCode).toBe(0);
      // Only model is valid
      expect(stripAnsi(stdout.trim())).toBe('🤖 Opus');
    });

    it('handles missing context_window gracefully', () => {
      mkdirSync(testCacheDir, { recursive: true });
      const input = JSON.stringify({
        model: { display_name: 'Claude Opus 4.5' },
        cost: { total_cost_usd: 0.23 },
      });
      const { stdout, exitCode } = runCli(input, { env: { CCUSAGE_CACHE_DIR: testCacheDir } });
      expect(exitCode).toBe(0);
      expect(stripAnsi(stdout.trim())).toBe('🤖 Opus | 💰 $0.23 sess');
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
      const cleanOutput = assertSingleLine(stdout);
      expect(cleanOutput.length).toBeGreaterThan(0);
    });

    it('handles empty input via direct execution', () => {
      const { stdout, exitCode } = runCliDirect('');
      expect(exitCode).toBe(0);
      const cleanOutput = assertSingleLine(stdout);
      expect(cleanOutput.length).toBeGreaterThan(0);
    });

    it('handles invalid JSON via direct execution', () => {
      const { stdout, exitCode } = runCliDirect('not json');
      expect(exitCode).toBe(0);
      const cleanOutput = assertSingleLine(stdout);
      expect(cleanOutput.length).toBeGreaterThan(0);
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

  describe('cache integration (always reads cache now)', () => {
    const testCacheDir = join(tmpdir(), `ccusage-int-cache-${String(process.pid)}`);

    afterEach(() => {
      if (existsSync(testCacheDir)) {
        rmSync(testCacheDir, { recursive: true, force: true });
      }
    });

    it('includes daily total in cost segment when cache has fresh entry', () => {
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

      const input = JSON.stringify({
        model: { display_name: 'Claude Opus 4.5' },
        cost: { total_cost_usd: 0.23 },
        context_window: {
          used_percentage: 42,
          context_window_size: 200000,
          current_usage: { input_tokens: 84000 },
        },
      });

      const { stdout, exitCode } = runCli(input, { env: { CCUSAGE_CACHE_DIR: testCacheDir } });
      expect(exitCode).toBe(0);
      expect(stripAnsi(stdout.trim())).toBe('🤖 Opus | 💰 $0.23 sess / $2.50 today | 🧠 84.0k/200k [███░░░░░] 42%');
    });

    it('includes burn rate segment when cache has fresh entry', () => {
      mkdirSync(testCacheDir, { recursive: true });

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
        context_window: {
          used_percentage: 42,
          context_window_size: 200000,
          current_usage: { input_tokens: 84000 },
        },
      });

      const { stdout, exitCode } = runCli(input, { env: { CCUSAGE_CACHE_DIR: testCacheDir } });
      expect(exitCode).toBe(0);
      expect(stripAnsi(stdout.trim())).toBe('🤖 Opus | 💰 $0.23 sess | 🔥 $0.25/hr | 🧠 84.0k/200k [███░░░░░] 42%');
    });

    it('includes block info in cost segment when cache has fresh entry', () => {
      mkdirSync(testCacheDir, { recursive: true });

      writeFileSync(
        join(testCacheDir, 'block-info.json'),
        JSON.stringify({
          cost_usd: 0.45,
          remaining_seconds: 9900, // 2h 45m
          updated_at: Date.now(),
        })
      );

      const input = JSON.stringify({
        model: { display_name: 'Claude Opus 4.5' },
        cost: { total_cost_usd: 0.23 },
        context_window: {
          used_percentage: 12,
          context_window_size: 200000,
          current_usage: { input_tokens: 25000 },
        },
      });

      const { stdout, exitCode } = runCli(input, { env: { CCUSAGE_CACHE_DIR: testCacheDir } });
      expect(exitCode).toBe(0);
      expect(stripAnsi(stdout.trim())).toBe('🤖 Opus | 💰 $0.23 sess / $0.45 (2h 45m left) | 🧠 25.0k/200k [█░░░░░░░] 12%');
    });

    it('formats full output with all cache entries', () => {
      mkdirSync(testCacheDir, { recursive: true });

      writeFileSync(
        join(testCacheDir, 'daily-total.json'),
        JSON.stringify({
          cost_usd: 1.23,
          date: new Date().toISOString().slice(0, 10),
          updated_at: Date.now(),
        })
      );

      writeFileSync(
        join(testCacheDir, 'block-info.json'),
        JSON.stringify({
          cost_usd: 0.45,
          remaining_seconds: 9900,
          updated_at: Date.now(),
        })
      );

      writeFileSync(
        join(testCacheDir, 'burn-rate.json'),
        JSON.stringify({
          rate_per_hour: 0.12,
          updated_at: Date.now(),
        })
      );

      const input = JSON.stringify({
        model: { display_name: 'Claude Opus 4.5' },
        cost: { total_cost_usd: 0.23 },
        context_window: {
          used_percentage: 12,
          context_window_size: 200000,
          current_usage: { input_tokens: 25000 },
        },
      });

      const { stdout, exitCode } = runCli(input, { env: { CCUSAGE_CACHE_DIR: testCacheDir } });
      expect(exitCode).toBe(0);
      expect(stripAnsi(stdout.trim())).toBe(
        '🤖 Opus | 💰 $0.23 sess / $1.23 today / $0.45 (2h 45m left) | 🔥 $0.12/hr | 🧠 25.0k/200k [█░░░░░░░] 12%'
      );
    });

    it('gracefully handles missing cache (shows basic output)', () => {
      // Ensure test cache directory doesn't exist
      if (existsSync(testCacheDir)) {
        rmSync(testCacheDir, { recursive: true, force: true });
      }
      mkdirSync(testCacheDir, { recursive: true });

      const input = JSON.stringify({
        model: { display_name: 'Claude Opus 4.5' },
        cost: { total_cost_usd: 0.23 },
        context_window: {
          used_percentage: 42,
          context_window_size: 200000,
          current_usage: { input_tokens: 84000 },
        },
      });

      const { stdout, exitCode } = runCli(input, { env: { CCUSAGE_CACHE_DIR: testCacheDir } });
      expect(exitCode).toBe(0);
      // Should still produce output without cache data
      expect(stripAnsi(stdout.trim())).toBe('🤖 Opus | 💰 $0.23 sess | 🧠 84.0k/200k [███░░░░░] 42%');
    });
  });
});
