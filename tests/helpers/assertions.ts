import { expect } from 'vitest';
import { stripAnsi } from '../../src/utils/colors.js';

/**
 * Strips ANSI codes and removes the single trailing newline added by console.log.
 * Both assertSingleLine and assertMultiLine apply this normalization before
 * their line-count assertions.
 */
function normalizeCliOutput(output: string | Buffer): string {
  const text = typeof output === 'string' ? output : output.toString('utf-8');
  return stripAnsi(text).replace(/\r?\n$/, '');
}

/**
 * Helper to assert single-line guarantee without relying on trim().
 * - Strips ANSI escape codes
 * - Removes only ONE trailing newline (from console.log)
 * - Asserts no remaining newlines exist
 * - Returns the clean output for further assertions
 */
export function assertSingleLine(output: string | Buffer): string {
  const normalized = normalizeCliOutput(output);
  expect(normalized).not.toMatch(/[\r\n]/);
  return normalized;
}

/**
 * Helper to assert multi-line output from the CLI.
 * - Strips ANSI escape codes
 * - Removes only ONE trailing newline (added by console.log)
 * - Asserts the output contains exactly `expectedLineCount` lines
 * - Returns the array of lines for further assertions
 */
export function assertMultiLine(output: string | Buffer, expectedLineCount: number): string[] {
  const normalized = normalizeCliOutput(output);
  const lines = normalized.split('\n');
  expect(lines).toHaveLength(expectedLineCount);
  return lines;
}
