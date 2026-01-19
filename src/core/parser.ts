import type {
  ClaudeCodeInput,
  ParseResult,
  ModelInfo,
} from '../types/claude-code.js';

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

/**
 * Type guard to check if model is a ModelInfo object.
 */
function isModelInfo(model: ModelInfo | string): model is ModelInfo {
  return typeof model === 'object';
}

/**
 * Extracts the model display name from the input.
 * Handles both nested (model.display_name) and flat (model) schemas.
 *
 * @param input - Parsed input or null
 * @returns Display name string or undefined
 */
export function extractModelDisplayName(input: ClaudeCodeInput | null): string | undefined {
  if (input === null) {
    return undefined;
  }

  const model = input.model;
  if (model === undefined) {
    return undefined;
  }

  if (isModelInfo(model)) {
    // Prefer display_name, fallback to id
    return model.display_name ?? model.id;
  }

  // Flat schema: model is a string
  return model;
}

/**
 * Extracts the session cost from the input.
 * Handles both nested (cost.total_cost_usd) and flat (cost_usd) schemas.
 *
 * @param input - Parsed input or null
 * @returns Cost in USD or undefined
 */
export function extractSessionCost(input: ClaudeCodeInput | null): number | undefined {
  if (input === null) {
    return undefined;
  }

  // Prefer nested cost.total_cost_usd
  if (input.cost?.total_cost_usd !== undefined) {
    return input.cost.total_cost_usd;
  }

  // Fallback to flat cost_usd
  return input.cost_usd;
}

/**
 * Extracts the context usage percentage from the input.
 *
 * @param input - Parsed input or null
 * @returns Usage percentage (0-100) or undefined
 */
export function extractContextUsage(input: ClaudeCodeInput | null): number | undefined {
  if (input === null) {
    return undefined;
  }

  return input.context_window?.used_percentage;
}
