import type { ClaudeCodeInput } from '../types/claude-code.js';

/**
 * Visible fallback output when no meaningful statusline can be generated.
 * MUST be non-empty to satisfy AGENTS.md "NEVER silent" requirement.
 */
export const FALLBACK_OUTPUT = '? | Loading...';

/**
 * Generates a statusline string from Claude Code input.
 *
 * Guarantees:
 * - NEVER throws (catches all errors internally)
 * - ALWAYS returns a non-empty, visible single line
 * - Returns FALLBACK_OUTPUT on any error or missing input
 *
 * @param input - Parsed input from Claude Code, or null if parsing failed
 * @returns A non-empty, single-line string
 */
export function generateStatusline(input: ClaudeCodeInput | null): string {
  try {
    // Handle null/missing input
    if (input === null) {
      return FALLBACK_OUTPUT;
    }

    // Bootstrap phase: return fallback
    // Future: format usage data into statusline segments
    const output = FALLBACK_OUTPUT;

    // Ensure single line and non-empty output
    return ensureVisibleOutput(output);
  } catch {
    // Ultimate safety net: never throw, always return visible fallback
    return FALLBACK_OUTPUT;
  }
}

/**
 * Ensures the output is a single visible line.
 * Takes only the first line and falls back if result is empty/whitespace.
 */
function ensureVisibleOutput(text: string): string {
  const firstLine = text.split('\n')[0] ?? '';
  const trimmed = firstLine.trim();

  // Never return empty or whitespace-only output
  if (trimmed === '') {
    return FALLBACK_OUTPUT;
  }

  return firstLine;
}
