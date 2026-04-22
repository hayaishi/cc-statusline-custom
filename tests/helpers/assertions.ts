import { expect } from 'vitest';
import { stripAnsi } from '../../src/utils/colors.js';

/**
 * Helper to assert single-line guarantee without relying on trim().
 * - Strips ANSI escape codes
 * - Removes only ONE trailing newline (from console.log)
 * - Asserts no remaining newlines exist
 * - Returns the clean output for further assertions
 */
export function assertSingleLine(output: string | Buffer): string {
  const text = typeof output === 'string' ? output : output.toString('utf-8');
  const stripped = stripAnsi(text);
  // Remove only one trailing newline (added by console.log)
  const withoutTrailing = stripped.replace(/\r?\n$/, '');
  // Assert no embedded newlines remain
  expect(withoutTrailing).not.toMatch(/[\r\n]/);
  return withoutTrailing;
}

/**
 * Helper to assert multi-line output from the CLI.
 * - Strips ANSI escape codes
 * - Removes only ONE trailing newline (added by console.log)
 * - Asserts the output contains exactly `expectedLineCount` lines
 * - Returns the array of lines for further assertions
 */
export function assertMultiLine(output: string | Buffer, expectedLineCount: number): string[] {
  const text = typeof output === 'string' ? output : output.toString('utf-8');
  const stripped = stripAnsi(text);
  const withoutTrailing = stripped.replace(/\r?\n$/, '');
  const lines = withoutTrailing.split('\n');
  expect(lines).toHaveLength(expectedLineCount);
  return lines;
}
