import { describe, it, expect, beforeAll } from 'vitest';
import { execSync, execFileSync, type ExecSyncOptions } from 'node:child_process';
import { readFileSync, accessSync, constants } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

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

  describe('direct execution (shebang + permissions)', () => {
    it('has execute permissions on dist/index.js', () => {
      // Verify file has execute bit set
      expect(() => {
        accessSync(CLI_PATH, constants.X_OK);
      }).not.toThrow();
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
});
