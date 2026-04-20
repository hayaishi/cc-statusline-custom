/**
 * Type definitions for Claude Code statusline input.
 *
 * These types represent the JSON payload received via stdin from Claude Code.
 * The schema follows the official Claude Code statusline documentation.
 *
 * @see https://code.claude.com/docs/en/statusline
 */

/**
 * Model information from Claude Code.
 */
export interface ModelInfo {
  readonly id?: string;
  readonly display_name?: string;
}

/**
 * Cost information for the current session.
 */
export interface CostInfo {
  readonly total_cost_usd?: number;
  readonly total_duration_ms?: number;
  readonly total_api_duration_ms?: number;
  readonly total_lines_added?: number;
  readonly total_lines_removed?: number;
}

/**
 * Current token usage counters from the last API call.
 * May be null if no messages have been sent yet.
 */
export interface CurrentUsage {
  readonly input_tokens?: number;
  readonly output_tokens?: number;
  readonly cache_creation_input_tokens?: number;
  readonly cache_read_input_tokens?: number;
}

/**
 * Context window usage information.
 */
export interface ContextWindow {
  readonly total_input_tokens?: number;
  readonly total_output_tokens?: number;
  readonly context_window_size?: number;
  readonly used_percentage?: number;
  readonly remaining_percentage?: number;
  readonly current_usage?: CurrentUsage | null;
}

/**
 * Workspace information.
 */
export interface WorkspaceInfo {
  readonly current_dir?: string;
  readonly project_dir?: string;
}

/**
 * Output style configuration.
 */
export interface OutputStyle {
  readonly name?: string;
}

/**
 * Single rate-limit window from Claude Code's official statusline data.
 */
export interface RateLimitWindow {
  readonly used_percentage?: number;
  readonly resets_at?: number;
}

/**
 * Rate limit data from Claude Code's official statusline data.
 */
export interface RateLimits {
  readonly five_hour?: RateLimitWindow | null;
  readonly seven_day?: RateLimitWindow | null;
}

/**
 * Input payload from Claude Code's statusline feature.
 *
 * This interface represents the JSON structure passed via stdin.
 * All fields are optional to support graceful degradation.
 *
 * Supports both:
 * - Nested schema (official Claude Code format)
 * - Flat schema (backward compatibility)
 */
export interface ClaudeCodeInput {
  // Event metadata
  readonly hook_event_name?: string;
  readonly session_id?: string;
  readonly transcript_path?: string;
  readonly cwd?: string;
  readonly version?: string;

  // Nested model info (official format)
  readonly model?: ModelInfo | string;

  // Nested cost info (official format)
  readonly cost?: CostInfo;
  // Flat cost (backward compat)
  readonly cost_usd?: number;

  // Context window info
  readonly context_window?: ContextWindow;
  // Flat current_usage (backward compat)
  readonly current_usage?: CurrentUsage;

  // Workspace info
  readonly workspace?: WorkspaceInfo;

  // Output style
  readonly output_style?: OutputStyle;

  // Rate limit data (official Claude Code statusline field)
  readonly rate_limits?: RateLimits | null;

  // Allow additional unknown fields for forward compatibility
  readonly [key: string]: unknown;
}

/**
 * Result of parsing Claude Code input.
 * null indicates parsing failed and fallback should be used.
 */
export type ParseResult = ClaudeCodeInput | null;
