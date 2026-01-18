import { readFileSync } from 'node:fs';

/**
 * Reads all content from stdin synchronously.
 *
 * Uses synchronous file descriptor read for minimal latency.
 * Returns empty string on any error to support fallback behavior.
 *
 * @returns Content from stdin, or empty string on error
 */
export function readStdinSync(): string {
  try {
    // File descriptor 0 is stdin
    // Using 'utf-8' encoding returns a string directly
    return readFileSync(0, 'utf-8');
  } catch {
    // Return empty string on any error (pipe closed, no input, etc.)
    return '';
  }
}
