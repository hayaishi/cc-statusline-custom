import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { execSync, execFileSync, type ExecSyncOptions } from 'node:child_process';
import { readFileSync, accessSync, constants, mkdirSync, writeFileSync, rmSync, existsSync, utimesSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { assertSingleLine } from '../helpers/assertions.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '../..');
const CLI_PATH = join(PROJECT_ROOT, 'dist/index.js');
const FIXTURE_PATH = join(PROJECT_ROOT, 'tests/fixtures/claude-code-input.json');

/**
 * Helper to run the CLI with given stdin input and optional CLI flags.
 * Returns stdout output and exit code.
 */
function runCli(
  stdin: string,
  args: string[] = [],
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

  const cliArgs = args.length > 0 ? ` ${args.join(' ')}` : '';

  try {
    const stdout = execSync(`node ${CLI_PATH}${cliArgs}`, execOptions);
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
      runCli('{}', [], { timeout: 1000 });
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
      const { stdout, exitCode } = runCli(input, [], { env: { CCSTATUSLINE_CACHE_DIR: testCacheDir } });
      expect(exitCode).toBe(0);
      const cleanOutput = assertSingleLine(stdout);
      expect(cleanOutput).toBe(
        '🤖 Opus | 💰 $0.23 sess | 🧠 84.0k/200k [███░░░░░] (42%) | 📦 Loading...'
      );
    });

    it('formats partial schema (model only)', () => {
      mkdirSync(testCacheDir, { recursive: true });
      const input = JSON.stringify({
        model: { display_name: 'Claude Sonnet 4' },
      });
      const { stdout, exitCode } = runCli(input, [], { env: { CCSTATUSLINE_CACHE_DIR: testCacheDir } });
      expect(exitCode).toBe(0);
      const cleanOutput = assertSingleLine(stdout);
      expect(cleanOutput).toBe('🤖 Sonnet | 🧠 [░░░░░░░░] (0%) | 📦 Loading...');
    });

    it('formats partial schema (model + cost)', () => {
      mkdirSync(testCacheDir, { recursive: true });
      const input = JSON.stringify({
        model: { display_name: 'Claude Haiku' },
        cost: { total_cost_usd: 0.01 },
      });
      const { stdout, exitCode } = runCli(input, [], { env: { CCSTATUSLINE_CACHE_DIR: testCacheDir } });
      expect(exitCode).toBe(0);
      const cleanOutput = assertSingleLine(stdout);
      expect(cleanOutput).toBe('🤖 Haiku | 💰 $0.01 sess | 🧠 [░░░░░░░░] (0%) | 📦 Loading...');
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
      const { stdout, exitCode } = runCli(input, [], { env: { CCSTATUSLINE_CACHE_DIR: testCacheDir } });
      expect(exitCode).toBe(0);
      const cleanOutput = assertSingleLine(stdout);
      expect(cleanOutput).toBe(
        '🤖 Sonnet | 💰 $0.15 sess | 🧠 50.0k/200k [██░░░░░░] (25%) | 📦 Loading...'
      );
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
      const { stdout, exitCode } = runCli(input, [], { env: { CCSTATUSLINE_CACHE_DIR: testCacheDir } });
      expect(exitCode).toBe(0);
      const cleanOutput = assertSingleLine(stdout);
      expect(cleanOutput).toBe('🤖 Opus | 🧠 0/200k [░░░░░░░░] (0%) | 📦 Loading...');
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
      const { stdout, exitCode } = runCli(input, [], { env: { CCSTATUSLINE_CACHE_DIR: testCacheDir } });
      expect(exitCode).toBe(0);
      const cleanOutput = assertSingleLine(stdout);
      expect(cleanOutput).toContain('43%');
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
      const { stdout, exitCode } = runCli(input, [], { env: { CCSTATUSLINE_CACHE_DIR: testCacheDir } });
      expect(exitCode).toBe(0);
      // cost + context placeholder
      const cleanOutput = assertSingleLine(stdout);
      expect(cleanOutput).toBe('💰 $0.50 sess | 🧠 [░░░░░░░░] (0%) | 📦 Loading...');
    });

    it('handles invalid cost gracefully', () => {
      mkdirSync(testCacheDir, { recursive: true });
      const input = JSON.stringify({
        model: { display_name: 'Claude Opus 4.5' },
        cost: { total_cost_usd: NaN },
      });
      const { stdout, exitCode } = runCli(input, [], { env: { CCSTATUSLINE_CACHE_DIR: testCacheDir } });
      expect(exitCode).toBe(0);
      // model + context placeholder (cost is invalid, skipped)
      const cleanOutput = assertSingleLine(stdout);
      expect(cleanOutput).toBe('🤖 Opus | 🧠 [░░░░░░░░] (0%) | 📦 Loading...');
    });

    it('handles missing context_window gracefully', () => {
      mkdirSync(testCacheDir, { recursive: true });
      const input = JSON.stringify({
        model: { display_name: 'Claude Opus 4.5' },
        cost: { total_cost_usd: 0.23 },
      });
      const { stdout, exitCode } = runCli(input, [], { env: { CCSTATUSLINE_CACHE_DIR: testCacheDir } });
      expect(exitCode).toBe(0);
      const cleanOutput = assertSingleLine(stdout);
      expect(cleanOutput).toBe('🤖 Opus | 💰 $0.23 sess | 🧠 [░░░░░░░░] (0%) | 📦 Loading...');
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

    it('renders subscription usage segment when cache has subscription-usage.json', () => {
      mkdirSync(testCacheDir, { recursive: true });

      writeFileSync(
        join(testCacheDir, 'subscription-usage.json'),
        JSON.stringify({
          utilizationPercent: 55,
          resetsAt: '2026-01-20T15:45:00Z',
          lastError: null,
          lastAttemptAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
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

      const { stdout, exitCode } = runCli(input, [], {
        env: { CCSTATUSLINE_CACHE_DIR: testCacheDir, TZ: 'UTC' },
      });
      expect(exitCode).toBe(0);
      const cleanOutput = assertSingleLine(stdout);
      expect(cleanOutput).toBe(
        '🤖 Opus | 💰 $0.23 sess | 🧠 25.0k/200k [█░░░░░░░] (12%) | 📦 55% [████░░░░] (~3:45pm)'
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

      const { stdout, exitCode } = runCli(input, [], { env: { CCSTATUSLINE_CACHE_DIR: testCacheDir } });
      expect(exitCode).toBe(0);
      // Should still produce output without cache data
      const cleanOutput = assertSingleLine(stdout);
      expect(cleanOutput).toBe(
        '🤖 Opus | 💰 $0.23 sess | 🧠 84.0k/200k [███░░░░░] (42%) | 📦 Loading...'
      );
    });
  });

  describe('CLI --segments flag', () => {
    const testCacheDir = join(tmpdir(), `ccusage-int-segments-${String(process.pid)}`);

    afterEach(() => {
      if (existsSync(testCacheDir)) {
        rmSync(testCacheDir, { recursive: true, force: true });
      }
    });

    function runCliWithSegments(
      stdin: string,
      segmentsFlag: string,
      env?: Record<string, string>
    ): { stdout: string; exitCode: number } {
      const execOptions: ExecSyncOptions = {
        input: stdin,
        encoding: 'utf-8',
        cwd: PROJECT_ROOT,
        timeout: 5000,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, CCSTATUSLINE_CACHE_DIR: testCacheDir, ...env },
      };

      // Always disable background updates to prevent race conditions between tests
      const flagsWithBgDisabled = segmentsFlag.includes('--disable-bg-update')
        ? segmentsFlag
        : `${segmentsFlag} --disable-bg-update`;

      try {
        const stdout = execSync(`node ${CLI_PATH} ${flagsWithBgDisabled}`, execOptions);
        return { stdout: String(stdout), exitCode: 0 };
      } catch (error) {
        const execError = error as { status?: number; stdout?: Buffer | string };
        return {
          stdout: String(execError.stdout ?? ''),
          exitCode: execError.status ?? 1,
        };
      }
    }

    it('respects --segments=<csv> flag for order', () => {
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

      const { stdout, exitCode } = runCliWithSegments(input, '--segments=context,model');
      expect(exitCode).toBe(0);
      const cleanOutput = assertSingleLine(stdout);
      expect(cleanOutput).toBe('🧠 84.0k/200k [███░░░░░] (42%) | 🤖 Opus');
    });

    it('respects -s <csv> short flag', () => {
      mkdirSync(testCacheDir, { recursive: true });
      const input = JSON.stringify({
        model: { display_name: 'Claude Opus 4.5' },
        cost: { total_cost_usd: 0.23 },
      });

      const { stdout, exitCode } = runCliWithSegments(input, '-s cost_session,model');
      expect(exitCode).toBe(0);
      const cleanOutput = assertSingleLine(stdout);
      expect(cleanOutput).toBe('💰 $0.23 sess | 🤖 Opus');
    });

    it('CLI flag overrides environment variable', () => {
      mkdirSync(testCacheDir, { recursive: true });
      const input = JSON.stringify({
        model: { display_name: 'Claude Opus 4.5' },
        cost: { total_cost_usd: 0.23 },
      });

      const { stdout, exitCode } = runCliWithSegments(
        input,
        '--segments=model',
        { CCSTATUSLINE_SEGMENTS: 'cost_session,model' }
      );
      expect(exitCode).toBe(0);
      const cleanOutput = assertSingleLine(stdout);
      expect(cleanOutput).toBe('🤖 Opus');
    });

    it('uses environment variable when CLI flag absent', () => {
      mkdirSync(testCacheDir, { recursive: true });
      const input = JSON.stringify({
        model: { display_name: 'Claude Opus 4.5' },
        cost: { total_cost_usd: 0.23 },
      });

      const { stdout, exitCode } = runCli(input, [], {
        env: {
          CCSTATUSLINE_CACHE_DIR: testCacheDir,
          CCSTATUSLINE_SEGMENTS: 'cost_session,model',
        },
      });
      expect(exitCode).toBe(0);
      const cleanOutput = assertSingleLine(stdout);
      expect(cleanOutput).toBe('💰 $0.23 sess | 🤖 Opus');
    });

    it('normalizes aliases (sub -> subscription_usage)', () => {
      mkdirSync(testCacheDir, { recursive: true });
      const input = JSON.stringify({
        model: { display_name: 'Claude Opus 4.5' },
      });

      const { stdout, exitCode } = runCliWithSegments(input, '-s model,sub --disable-bg-update');
      expect(exitCode).toBe(0);
      const cleanOutput = assertSingleLine(stdout);
      expect(cleanOutput).toBe('🤖 Opus | 📦 Loading...');
    });

    it('normalizes ctx alias to context', () => {
      mkdirSync(testCacheDir, { recursive: true });
      const input = JSON.stringify({
        model: { display_name: 'Claude Opus 4.5' },
        context_window: {
          used_percentage: 42,
          context_window_size: 200000,
          current_usage: { input_tokens: 84000 },
        },
      });

      const { stdout, exitCode } = runCliWithSegments(input, '-s model,ctx');
      expect(exitCode).toBe(0);
      const cleanOutput = assertSingleLine(stdout);
      expect(cleanOutput).toBe('🤖 Opus | 🧠 84.0k/200k [███░░░░░] (42%)');
    });

    it('normalizes cost_usd alias to cost_session', () => {
      mkdirSync(testCacheDir, { recursive: true });
      const input = JSON.stringify({
        model: { display_name: 'Claude Opus 4.5' },
        cost: { total_cost_usd: 0.23 },
      });

      const { stdout, exitCode } = runCliWithSegments(input, '-s model,cost_usd');
      expect(exitCode).toBe(0);
      const cleanOutput = assertSingleLine(stdout);
      expect(cleanOutput).toBe('🤖 Opus | 💰 $0.23 sess');
    });

    it('ignores unknown segments gracefully', () => {
      mkdirSync(testCacheDir, { recursive: true });
      const input = JSON.stringify({
        model: { display_name: 'Claude Opus 4.5' },
        cost: { total_cost_usd: 0.23 },
      });

      const { stdout, exitCode } = runCliWithSegments(input, '-s model,unknown,cost_session');
      expect(exitCode).toBe(0);
      const cleanOutput = assertSingleLine(stdout);
      expect(cleanOutput).toBe('🤖 Opus | 💰 $0.23 sess');
    });

    it('falls back to default when all segments unknown', () => {
      mkdirSync(testCacheDir, { recursive: true });
      const input = JSON.stringify({
        model: { display_name: 'Claude Opus 4.5' },
      });

      const { stdout, exitCode } = runCliWithSegments(input, '-s unknown,invalid --disable-bg-update');
      expect(exitCode).toBe(0);
      // Default order: model, cost_session, context, subscription_usage
      const cleanOutput = assertSingleLine(stdout);
      expect(cleanOutput).toBe('🤖 Opus | 🧠 [░░░░░░░░] (0%) | 📦 Loading...');
    });

    it('maintains single-line output invariant', () => {
      mkdirSync(testCacheDir, { recursive: true });
      const input = JSON.stringify({
        model: { display_name: 'Claude Opus 4.5' },
        cost: { total_cost_usd: 0.23 },
      });

      const { stdout, exitCode } = runCliWithSegments(input, '-s model,cost_session');
      expect(exitCode).toBe(0);
      assertSingleLine(stdout);
    });

    it('always exits with code 0', () => {
      mkdirSync(testCacheDir, { recursive: true });
      const { exitCode: exit1 } = runCliWithSegments('{}', '-s unknown');
      const { exitCode: exit2 } = runCliWithSegments('invalid', '-s model');
      const { exitCode: exit3 } = runCliWithSegments('', '-s context');
      expect(exit1).toBe(0);
      expect(exit2).toBe(0);
      expect(exit3).toBe(0);
    });

    describe('last-wins semantics for multiple flags', () => {
      it('uses last --segments value when multiple provided', () => {
        mkdirSync(testCacheDir, { recursive: true });
        const input = JSON.stringify({
          model: { display_name: 'Claude Opus 4.5' },
          cost: { total_cost_usd: 0.23 },
        });

        // Last --segments=model should win over first --segments=cost_session
        const { stdout, exitCode } = runCliWithSegments(input, '--segments=cost_session --segments=model');
        expect(exitCode).toBe(0);
        const cleanOutput = assertSingleLine(stdout);
        expect(cleanOutput).toBe('🤖 Opus');
      });

      it('uses last -s value when multiple provided', () => {
        mkdirSync(testCacheDir, { recursive: true });
        const input = JSON.stringify({
          model: { display_name: 'Claude Opus 4.5' },
          cost: { total_cost_usd: 0.23 },
        });

        // Last -s model should win over first -s cost_session
        const { stdout, exitCode } = runCliWithSegments(input, '-s cost_session -s model');
        expect(exitCode).toBe(0);
        const cleanOutput = assertSingleLine(stdout);
        expect(cleanOutput).toBe('🤖 Opus');
      });

      it('uses last value when mixing --segments and -s', () => {
        mkdirSync(testCacheDir, { recursive: true });
        const input = JSON.stringify({
          model: { display_name: 'Claude Opus 4.5' },
          cost: { total_cost_usd: 0.23 },
        });

        // -s cost_session (last) should win over --segments=model (first)
        const { stdout, exitCode } = runCliWithSegments(input, '--segments=model -s cost_session');
        expect(exitCode).toBe(0);
        const cleanOutput = assertSingleLine(stdout);
        expect(cleanOutput).toBe('💰 $0.23 sess');
      });
    });

    it('handles --segments with space separator', () => {
      mkdirSync(testCacheDir, { recursive: true });
      const input = JSON.stringify({
        model: { display_name: 'Claude Opus 4.5' },
        cost: { total_cost_usd: 0.23 },
      });

      // Use shell form to test --segments value as separate arg
      const { stdout, exitCode } = runCliWithSegments(input, '--segments model,cost_session');
      expect(exitCode).toBe(0);
      const cleanOutput = assertSingleLine(stdout);
      expect(cleanOutput).toBe('🤖 Opus | 💰 $0.23 sess');
    });

    it('falls back to default when --segments value is empty', () => {
      mkdirSync(testCacheDir, { recursive: true });
      const input = JSON.stringify({
        model: { display_name: 'Claude Opus 4.5' },
      });

      const { stdout, exitCode } = runCliWithSegments(input, '--segments= --disable-bg-update');
      expect(exitCode).toBe(0);
      // Default order used
      const cleanOutput = assertSingleLine(stdout);
      expect(cleanOutput).toBe('🤖 Opus | 🧠 [░░░░░░░░] (0%) | 📦 Loading...');
    });

    it('falls back to default when -s is at end without value', () => {
      mkdirSync(testCacheDir, { recursive: true });
      const input = JSON.stringify({
        model: { display_name: 'Claude Opus 4.5' },
      });

      const { stdout, exitCode } = runCliWithSegments(input, '-s --disable-bg-update');
      expect(exitCode).toBe(0);
      // Default order used when no value provided
      const cleanOutput = assertSingleLine(stdout);
      expect(cleanOutput).toBe('🤖 Opus | 🧠 [░░░░░░░░] (0%) | 📦 Loading...');
    });

    it('does not consume another flag as segment value', () => {
      mkdirSync(testCacheDir, { recursive: true });
      const input = JSON.stringify({
        model: { display_name: 'Claude Opus 4.5' },
      });

      // -s followed by a flag-like arg should not use it as the value
      // Instead, -s should be ignored and default order used
      const { stdout, exitCode } = runCliWithSegments(input, '-s --disable-bg-update --some-other-flag');
      expect(exitCode).toBe(0);
      // Default order used since -s has no valid value (--some-other-flag starts with -)
      const cleanOutput = assertSingleLine(stdout);
      expect(cleanOutput).toBe('🤖 Opus | 🧠 [░░░░░░░░] (0%) | 📦 Loading...');
    });

    // CLI precedence tests: CLI present but invalid should NOT fall back to env
    describe('CLI precedence over env (no env fallback when CLI flag present)', () => {
      it('uses DEFAULT when CLI has all unknown tokens even if env is valid', () => {
        mkdirSync(testCacheDir, { recursive: true });
        const input = JSON.stringify({
          model: { display_name: 'Claude Opus 4.5' },
          cost: { total_cost_usd: 0.23 },
        });

        // CLI: --segments=unknown (invalid), ENV: model (valid)
        // Expected: DEFAULT order (not env), because CLI flag is present
        const { stdout, exitCode } = runCliWithSegments(
          input,
          '--segments=unknown --disable-bg-update',
          { CCSTATUSLINE_SEGMENTS: 'model' }
        );
        expect(exitCode).toBe(0);
        const cleanOutput = assertSingleLine(stdout);
        // Default order: model, cost_session, context, subscription_usage
        expect(cleanOutput).toBe('🤖 Opus | 💰 $0.23 sess | 🧠 [░░░░░░░░] (0%) | 📦 Loading...');
      });

      it('uses DEFAULT when CLI --segments is at end without value even if env is valid', () => {
        mkdirSync(testCacheDir, { recursive: true });
        const input = JSON.stringify({
          model: { display_name: 'Claude Opus 4.5' },
          cost: { total_cost_usd: 0.23 },
        });

        // CLI: --segments (no value), ENV: context,model (valid)
        // Expected: DEFAULT order (not env), because CLI flag is present
        const { stdout, exitCode } = runCliWithSegments(
          input,
          '--segments --disable-bg-update',
          { CCSTATUSLINE_SEGMENTS: 'context,model' }
        );
        expect(exitCode).toBe(0);
        const cleanOutput = assertSingleLine(stdout);
        // Default order, not env's context,model
        expect(cleanOutput).toBe('🤖 Opus | 💰 $0.23 sess | 🧠 [░░░░░░░░] (0%) | 📦 Loading...');
      });

      it('uses DEFAULT when CLI --segments= has empty value even if env is valid', () => {
        mkdirSync(testCacheDir, { recursive: true });
        const input = JSON.stringify({
          model: { display_name: 'Claude Opus 4.5' },
          cost: { total_cost_usd: 0.23 },
        });

        // CLI: --segments= (empty), ENV: cost_session,model (valid)
        // Expected: DEFAULT order (not env), because CLI flag is present
        const { stdout, exitCode } = runCliWithSegments(
          input,
          '--segments= --disable-bg-update',
          { CCSTATUSLINE_SEGMENTS: 'cost_session,model' }
        );
        expect(exitCode).toBe(0);
        const cleanOutput = assertSingleLine(stdout);
        // Default order, not env's cost_session,model
        expect(cleanOutput).toBe('🤖 Opus | 💰 $0.23 sess | 🧠 [░░░░░░░░] (0%) | 📦 Loading...');
      });

      it('uses DEFAULT when -s is at end without value even if env is valid', () => {
        mkdirSync(testCacheDir, { recursive: true });
        const input = JSON.stringify({
          model: { display_name: 'Claude Opus 4.5' },
          cost: { total_cost_usd: 0.23 },
        });

        // CLI: -s (no value), ENV: cost_session (valid)
        // Expected: DEFAULT order (not env), because CLI flag is present
        const { stdout, exitCode } = runCliWithSegments(
          input,
          '-s --disable-bg-update',
          { CCSTATUSLINE_SEGMENTS: 'cost_session' }
        );
        expect(exitCode).toBe(0);
        const cleanOutput = assertSingleLine(stdout);
        // Default order, not env's cost_session only
        expect(cleanOutput).toBe('🤖 Opus | 💰 $0.23 sess | 🧠 [░░░░░░░░] (0%) | 📦 Loading...');
      });

      it('uses DEFAULT when -s followed by flag even if env is valid', () => {
        mkdirSync(testCacheDir, { recursive: true });
        const input = JSON.stringify({
          model: { display_name: 'Claude Opus 4.5' },
          cost: { total_cost_usd: 0.23 },
        });

        // CLI: -s --foo (flag-like next arg), ENV: model (valid)
        // Expected: DEFAULT order (not env), because CLI flag is present
        const { stdout, exitCode } = runCliWithSegments(
          input,
          '-s --disable-bg-update --foo',
          { CCSTATUSLINE_SEGMENTS: 'model' }
        );
        expect(exitCode).toBe(0);
        const cleanOutput = assertSingleLine(stdout);
        // Default order, not env's model only
        expect(cleanOutput).toBe('🤖 Opus | 💰 $0.23 sess | 🧠 [░░░░░░░░] (0%) | 📦 Loading...');
      });
    });
  });

  describe('display toggles (--no-emojis, --no-bars)', () => {
    const testCacheDir = join(tmpdir(), `ccusage-int-toggles-${String(process.pid)}`);

    afterEach(() => {
      if (existsSync(testCacheDir)) {
        rmSync(testCacheDir, { recursive: true, force: true });
      }
    });

    describe('--no-emojis flag', () => {
      it('removes emojis and adds ctx/usage labels', () => {
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

        const { stdout, exitCode } = runCli(input, ['--no-emojis'], {
          env: { CCSTATUSLINE_CACHE_DIR: testCacheDir },
        });
        expect(exitCode).toBe(0);
        const cleanOutput = assertSingleLine(stdout);

        // No emojis
        expect(cleanOutput).not.toContain('🤖');
        expect(cleanOutput).not.toContain('💰');
        expect(cleanOutput).not.toContain('🧠');
        expect(cleanOutput).not.toContain('📦');

        // Has labels
        expect(cleanOutput).toContain('ctx:');
        expect(cleanOutput).toContain('usage:');

        // Still has other content
        expect(cleanOutput).toContain('Opus');
        expect(cleanOutput).toContain('$0.23');
        expect(cleanOutput).toContain('[███');
      });

      it('works with custom segment order', () => {
        mkdirSync(testCacheDir, { recursive: true });
        const input = JSON.stringify({
          model: { display_name: 'Claude Opus 4.5' },
          context_window: {
            used_percentage: 42,
            context_window_size: 200000,
            current_usage: { input_tokens: 84000 },
          },
        });

        const { stdout, exitCode } = runCli(input, ['--no-emojis', '--segments=context,model'], {
          env: { CCSTATUSLINE_CACHE_DIR: testCacheDir },
        });
        expect(exitCode).toBe(0);
        const cleanOutput = assertSingleLine(stdout);

        expect(cleanOutput).toContain('ctx:');
        expect(cleanOutput).toContain('Opus');
        expect(cleanOutput).not.toContain('🧠');

        // Verify order (ctx before model)
        const ctxIndex = cleanOutput.indexOf('ctx:');
        const modelIndex = cleanOutput.indexOf('Opus');
        expect(ctxIndex).toBeLessThan(modelIndex);
      });
    });

    describe('--no-bars flag', () => {
      it('removes progress bars from context and subscription segments', () => {
        mkdirSync(testCacheDir, { recursive: true });
        const input = JSON.stringify({
          model: { display_name: 'Claude Opus 4.5' },
          context_window: {
            used_percentage: 42,
            context_window_size: 200000,
            current_usage: { input_tokens: 84000 },
          },
        });

        const { stdout, exitCode } = runCli(input, ['--no-bars'], {
          env: { CCSTATUSLINE_CACHE_DIR: testCacheDir },
        });
        expect(exitCode).toBe(0);
        const cleanOutput = assertSingleLine(stdout);

        // No bars
        expect(cleanOutput).not.toContain('[');
        expect(cleanOutput).not.toContain('█');
        expect(cleanOutput).not.toContain('░');

        // Still has percentages and emojis
        expect(cleanOutput).toContain('🧠');
        expect(cleanOutput).toContain('(42%)');
        expect(cleanOutput).toContain('📦');
      });
    });

    describe('combined --no-emojis --no-bars', () => {
      it('applies both transformations', () => {
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

        const { stdout, exitCode } = runCli(input, ['--no-emojis', '--no-bars'], {
          env: { CCSTATUSLINE_CACHE_DIR: testCacheDir },
        });
        expect(exitCode).toBe(0);
        const cleanOutput = assertSingleLine(stdout);

        // No emojis, no bars
        expect(cleanOutput).not.toContain('🧠');
        expect(cleanOutput).not.toContain('[');

        // Has labels and percentages
        expect(cleanOutput).toContain('ctx:');
        expect(cleanOutput).toContain('usage:');
        expect(cleanOutput).toContain('(42%)');
        expect(cleanOutput).toContain('84.0k/200k');
      });
    });

    describe('environment variable precedence', () => {
      it('CLI --no-emojis overrides env', () => {
        mkdirSync(testCacheDir, { recursive: true });
        const input = JSON.stringify({
          model: { display_name: 'Claude Opus 4.5' },
          context_window: {
            used_percentage: 42,
            context_window_size: 200000,
            current_usage: { input_tokens: 84000 },
          },
        });

        const { stdout, exitCode } = runCli(input, ['--no-emojis'], {
          env: { CCSTATUSLINE_CACHE_DIR: testCacheDir, CCSTATUSLINE_NO_EMOJIS: 'false' },
        });
        expect(exitCode).toBe(0);
        const cleanOutput = assertSingleLine(stdout);

        // CLI wins: no emojis
        expect(cleanOutput).not.toContain('🧠');
        expect(cleanOutput).toContain('ctx:');
      });

      it('env CCSTATUSLINE_NO_EMOJIS=true disables emojis when no CLI flag', () => {
        mkdirSync(testCacheDir, { recursive: true });
        const input = JSON.stringify({
          model: { display_name: 'Claude Opus 4.5' },
          context_window: {
            used_percentage: 42,
            context_window_size: 200000,
            current_usage: { input_tokens: 84000 },
          },
        });

        const { stdout, exitCode } = runCli(input, [], {
          env: { CCSTATUSLINE_CACHE_DIR: testCacheDir, CCSTATUSLINE_NO_EMOJIS: 'true' },
        });
        expect(exitCode).toBe(0);
        const cleanOutput = assertSingleLine(stdout);

        expect(cleanOutput).not.toContain('🧠');
        expect(cleanOutput).toContain('ctx:');
      });

      it('CLI --no-bars overrides env', () => {
        mkdirSync(testCacheDir, { recursive: true });
        const input = JSON.stringify({
          model: { display_name: 'Claude Opus 4.5' },
          context_window: {
            used_percentage: 42,
            context_window_size: 200000,
            current_usage: { input_tokens: 84000 },
          },
        });

        const { stdout, exitCode } = runCli(input, ['--no-bars'], {
          env: { CCSTATUSLINE_CACHE_DIR: testCacheDir, CCSTATUSLINE_NO_BARS: 'false' },
        });
        expect(exitCode).toBe(0);
        const cleanOutput = assertSingleLine(stdout);

        expect(cleanOutput).not.toContain('[');
      });

      it('env CCSTATUSLINE_NO_BARS=1 disables bars when no CLI flag', () => {
        mkdirSync(testCacheDir, { recursive: true });
        const input = JSON.stringify({
          model: { display_name: 'Claude Opus 4.5' },
          context_window: {
            used_percentage: 42,
            context_window_size: 200000,
            current_usage: { input_tokens: 84000 },
          },
        });

        const { stdout, exitCode } = runCli(input, [], {
          env: { CCSTATUSLINE_CACHE_DIR: testCacheDir, CCSTATUSLINE_NO_BARS: '1' },
        });
        expect(exitCode).toBe(0);
        const cleanOutput = assertSingleLine(stdout);

        expect(cleanOutput).not.toContain('[');
      });

      it('resolves emojis and bars independently', () => {
        mkdirSync(testCacheDir, { recursive: true });
        const input = JSON.stringify({
          model: { display_name: 'Claude Opus 4.5' },
          context_window: {
            used_percentage: 42,
            context_window_size: 200000,
            current_usage: { input_tokens: 84000 },
          },
        });

        const { stdout, exitCode } = runCli(input, ['--no-emojis'], {
          env: { CCSTATUSLINE_CACHE_DIR: testCacheDir, CCSTATUSLINE_NO_BARS: 'true' },
        });
        expect(exitCode).toBe(0);
        const cleanOutput = assertSingleLine(stdout);

        // Both disabled
        expect(cleanOutput).not.toContain('🧠');
        expect(cleanOutput).not.toContain('[');
        expect(cleanOutput).toContain('ctx:');
      });
    });

    describe('edge cases', () => {
      it('preserves single-line invariant with no-bars', () => {
        mkdirSync(testCacheDir, { recursive: true });
        const input = JSON.stringify({
          model: { display_name: 'Claude Opus 4.5' },
          context_window: {
            used_percentage: 42,
            context_window_size: 200000,
            current_usage: { input_tokens: 84000 },
          },
        });

        const { stdout, exitCode } = runCli(input, ['--no-bars'], {
          env: { CCSTATUSLINE_CACHE_DIR: testCacheDir },
        });
        expect(exitCode).toBe(0);
        assertSingleLine(stdout); // Throws if multiple lines
      });

      it('preserves single-line invariant with placeholder state and no-bars', () => {
        mkdirSync(testCacheDir, { recursive: true });
        const input = JSON.stringify({
          model: { display_name: 'Claude Opus' },
          // Missing context data
        });

        const { stdout, exitCode } = runCli(input, ['--no-bars'], {
          env: { CCSTATUSLINE_CACHE_DIR: testCacheDir },
        });
        expect(exitCode).toBe(0);
        assertSingleLine(stdout);
      });

      it('handles unknown state gracefully with toggles', () => {
        mkdirSync(testCacheDir, { recursive: true });
        const input = JSON.stringify({
          model: { display_name: 'Claude Opus' },
        });

        const { stdout, exitCode } = runCli(input, ['--no-emojis', '--no-bars'], {
          env: { CCSTATUSLINE_CACHE_DIR: testCacheDir },
        });
        expect(exitCode).toBe(0);
        const cleanOutput = assertSingleLine(stdout);
        expect(cleanOutput).toContain('Opus');
        // Explicit assertion for placeholder format (contiguous check)
        expect(cleanOutput).toContain('ctx: (0%)');
      });
    });

    describe('context percent parentheses', () => {
      it('wraps percent in parentheses by default', () => {
        mkdirSync(testCacheDir, { recursive: true });
        const input = JSON.stringify({
          model: { display_name: 'Claude Opus 4.5' },
          context_window: {
            used_percentage: 42,
            context_window_size: 200000,
            current_usage: { input_tokens: 84000 },
          },
        });

        const { stdout, exitCode } = runCli(input, [], {
          env: { CCSTATUSLINE_CACHE_DIR: testCacheDir },
        });
        expect(exitCode).toBe(0);
        const cleanOutput = assertSingleLine(stdout);
        expect(cleanOutput).toMatch(/\(\d+%\)/);
      });

      it('preserves parentheses with --no-emojis', () => {
        mkdirSync(testCacheDir, { recursive: true });
        const input = JSON.stringify({
          model: { display_name: 'Claude Opus 4.5' },
          context_window: {
            used_percentage: 42,
            context_window_size: 200000,
            current_usage: { input_tokens: 84000 },
          },
        });

        const { stdout, exitCode } = runCli(input, ['--no-emojis'], {
          env: { CCSTATUSLINE_CACHE_DIR: testCacheDir },
        });
        expect(exitCode).toBe(0);
        const cleanOutput = assertSingleLine(stdout);
        expect(cleanOutput).toMatch(/ctx:.*\(\d+%\)/);
      });

      it('preserves parentheses with --no-bars', () => {
        mkdirSync(testCacheDir, { recursive: true });
        const input = JSON.stringify({
          model: { display_name: 'Claude Opus 4.5' },
          context_window: {
            used_percentage: 42,
            context_window_size: 200000,
            current_usage: { input_tokens: 84000 },
          },
        });

        const { stdout, exitCode } = runCli(input, ['--no-bars'], {
          env: { CCSTATUSLINE_CACHE_DIR: testCacheDir },
        });
        expect(exitCode).toBe(0);
        const cleanOutput = assertSingleLine(stdout);
        expect(cleanOutput).toMatch(/\(\d+%\)/);
      });
    });
  });

  describe('subscription_usage_all segment integration', () => {
    const testCacheDir = join(tmpdir(), `ccusage-int-sub-all-${String(process.pid)}`);

    afterEach(() => {
      if (existsSync(testCacheDir)) {
        rmSync(testCacheDir, { recursive: true, force: true });
      }
    });

    it('renders both windows with correct formatting', () => {
      mkdirSync(testCacheDir, { recursive: true });

      writeFileSync(
        join(testCacheDir, 'subscription-usage.json'),
        JSON.stringify({
          utilizationPercent: 55,
          resetsAt: '2026-01-27T15:45:00Z',
          window: 'five_hour',
          fiveHour: {
            utilizationPercent: 55,
            resetsAt: '2026-01-27T15:45:00Z',
          },
          sevenDay: {
            utilizationPercent: 75,
            resetsAt: '2026-02-01T22:45:00Z',
          },
          lastError: null,
          lastAttemptAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
      );

      const input = JSON.stringify({
        model: { display_name: 'Claude Opus 4.5' },
      });

      const { stdout, exitCode } = runCli(input, ['--segments=model,sub_all'], {
        env: { CCSTATUSLINE_CACHE_DIR: testCacheDir, TZ: 'UTC' },
      });

      expect(exitCode).toBe(0);
      const cleanOutput = assertSingleLine(stdout);
      // five_hour: time only, seven_day: time + date
      // bar width is 4 (half of 8)
      expect(cleanOutput).toBe('🤖 Opus | ⌛️ 55% [██░░] (~3:45pm) 🌙 75% [███░] (~10:45pm, Feb 1)');
    });

    it('renders only five_hour when seven_day is missing', () => {
      mkdirSync(testCacheDir, { recursive: true });

      writeFileSync(
        join(testCacheDir, 'subscription-usage.json'),
        JSON.stringify({
          utilizationPercent: 55,
          resetsAt: '2026-01-27T15:45:00Z',
          window: 'five_hour',
          fiveHour: {
            utilizationPercent: 55,
            resetsAt: '2026-01-27T15:45:00Z',
          },
          // sevenDay is missing
          lastError: null,
          lastAttemptAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
      );

      const input = JSON.stringify({
        model: { display_name: 'Claude Opus 4.5' },
      });

      const { stdout, exitCode } = runCli(input, ['--segments=model,sub_all'], {
        env: { CCSTATUSLINE_CACHE_DIR: testCacheDir, TZ: 'UTC' },
      });

      expect(exitCode).toBe(0);
      const cleanOutput = assertSingleLine(stdout);
      // No trailing separators, only fiveHour shown
      expect(cleanOutput).toBe('🤖 Opus | ⌛️ 55% [██░░] (~3:45pm)');
      expect(cleanOutput).not.toContain('🌙');
    });

    it('shows fallback on fetch error', () => {
      mkdirSync(testCacheDir, { recursive: true });

      writeFileSync(
        join(testCacheDir, 'subscription-usage.json'),
        JSON.stringify({
          utilizationPercent: null,
          resetsAt: null,
          lastError: 'Network error',
          lastAttemptAt: new Date().toISOString(),  // Recent attempt
          updatedAt: new Date(Date.now() - 30000).toISOString(),  // Stale data
        })
      );

      const input = JSON.stringify({
        model: { display_name: 'Claude Opus 4.5' },
      });

      const { stdout, exitCode } = runCli(input, ['--segments=model,sub_all'], {
        env: { CCSTATUSLINE_CACHE_DIR: testCacheDir, TZ: 'UTC' },
      });

      expect(exitCode).toBe(0);
      const cleanOutput = assertSingleLine(stdout);
      expect(cleanOutput).toContain('Fetch Error...');
    });

    it('shows loading state when cache is stale', () => {
      mkdirSync(testCacheDir, { recursive: true });

      // Write stale cache (old updatedAt)
      const cacheFile = join(testCacheDir, 'subscription-usage.json');
      writeFileSync(
        cacheFile,
        JSON.stringify({
          utilizationPercent: 55,
          resetsAt: '2026-01-27T15:45:00Z',
          window: 'five_hour',
          fiveHour: {
            utilizationPercent: 55,
            resetsAt: '2026-01-27T15:45:00Z',
          },
          lastError: null,
          lastAttemptAt: new Date(Date.now() - 120000).toISOString(),
          updatedAt: new Date(Date.now() - 120000).toISOString(),
        })
      );

      // Set mtime to old time (beyond TTL of 60 seconds)
      const oldTime = new Date(Date.now() - 120000);
      utimesSync(cacheFile, oldTime, oldTime);

      const input = JSON.stringify({
        model: { display_name: 'Claude Opus 4.5' },
      });

      const { stdout, exitCode } = runCli(input, ['--segments=model,sub_all'], {
        env: { CCSTATUSLINE_CACHE_DIR: testCacheDir, TZ: 'UTC' },
      });

      expect(exitCode).toBe(0);
      const cleanOutput = assertSingleLine(stdout);
      expect(cleanOutput).toContain('Loading...');
    });

    it('respects --no-emojis flag', () => {
      mkdirSync(testCacheDir, { recursive: true });

      writeFileSync(
        join(testCacheDir, 'subscription-usage.json'),
        JSON.stringify({
          utilizationPercent: 55,
          resetsAt: '2026-01-27T15:45:00Z',
          window: 'five_hour',
          fiveHour: {
            utilizationPercent: 55,
            resetsAt: '2026-01-27T15:45:00Z',
          },
          sevenDay: {
            utilizationPercent: 75,
            resetsAt: '2026-02-01T22:45:00Z',
          },
          lastError: null,
          lastAttemptAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
      );

      const input = JSON.stringify({
        model: { display_name: 'Claude Opus 4.5' },
      });

      const { stdout, exitCode } = runCli(input, ['--segments=model,sub_all', '--no-emojis'], {
        env: { CCSTATUSLINE_CACHE_DIR: testCacheDir, TZ: 'UTC' },
      });

      expect(exitCode).toBe(0);
      const cleanOutput = assertSingleLine(stdout);
      expect(cleanOutput).toBe('Opus | 5h: 55% [██░░] (~3:45pm) 7d: 75% [███░] (~10:45pm, Feb 1)');
    });

    it('respects --no-bars flag', () => {
      mkdirSync(testCacheDir, { recursive: true });

      writeFileSync(
        join(testCacheDir, 'subscription-usage.json'),
        JSON.stringify({
          utilizationPercent: 55,
          resetsAt: '2026-01-27T15:45:00Z',
          window: 'five_hour',
          fiveHour: {
            utilizationPercent: 55,
            resetsAt: '2026-01-27T15:45:00Z',
          },
          sevenDay: {
            utilizationPercent: 75,
            resetsAt: '2026-02-01T22:45:00Z',
          },
          lastError: null,
          lastAttemptAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
      );

      const input = JSON.stringify({
        model: { display_name: 'Claude Opus 4.5' },
      });

      const { stdout, exitCode } = runCli(input, ['--segments=model,sub_all', '--no-bars'], {
        env: { CCSTATUSLINE_CACHE_DIR: testCacheDir, TZ: 'UTC' },
      });

      expect(exitCode).toBe(0);
      const cleanOutput = assertSingleLine(stdout);
      expect(cleanOutput).toBe('🤖 Opus | ⌛️ 55% (~3:45pm) 🌙 75% (~10:45pm, Feb 1)');
    });
  });
});
