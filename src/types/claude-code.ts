/**
 * Type definitions for Claude Code statusline input.
 *
 * These types represent the JSON payload received via stdin from Claude Code.
 * The structure is intentionally minimal for the bootstrap phase - fields will
 * be expanded as ccusage integration is implemented.
 */

/**
 * Context window usage information.
 */
export interface ContextWindow {
  readonly used_percentage?: number;
  readonly total_input_tokens?: number;
  readonly total_output_tokens?: number;
}

/**
 * Current token usage counters.
 */
export interface CurrentUsage {
  readonly input_tokens?: number;
  readonly output_tokens?: number;
  readonly cache_creation_input_tokens?: number;
  readonly cache_read_input_tokens?: number;
}

/**
 * Input payload from Claude Code's statusline feature.
 *
 * This interface represents the JSON structure passed via stdin.
 * All fields are optional to support graceful degradation.
 */
export interface ClaudeCodeInput {
  readonly model?: string;
  readonly cost_usd?: number;
  readonly context_window?: ContextWindow;
  readonly current_usage?: CurrentUsage;
}

/**
 * Result of parsing Claude Code input.
 * null indicates parsing failed and fallback should be used.
 */
export type ParseResult = ClaudeCodeInput | null;
