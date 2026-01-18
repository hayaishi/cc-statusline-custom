import type { ClaudeCodeInput, ParseResult } from '../types/claude-code.js';

/**
 * Safely parses JSON input from Claude Code.
 *
 * This function is designed to never throw, returning null for any
 * invalid input. This ensures the statusline can always produce output
 * even when given malformed data.
 *
 * @param raw - Raw string input, typically from stdin
 * @returns Parsed ClaudeCodeInput or null if parsing fails
 */
export function parseInput(raw: string): ParseResult {
  const trimmed = raw.trim();

  if (trimmed === '') {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(trimmed);

    // Only accept plain objects (not arrays, null, or primitives)
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }

    return parsed as ClaudeCodeInput;
  } catch {
    return null;
  }
}
