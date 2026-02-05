/**
 * Type definitions for plugin system.
 *
 * Plugins allow users to define custom segments that execute shell commands
 * and display their output in the statusline.
 */

/**
 * Refresh timing for plugin cache.
 * - 'session_start': Refresh when a new session starts (combined with TTL)
 */
export type PluginRefreshOn = 'session_start';

/**
 * Configuration for a single plugin.
 */
export interface PluginConfig {
  /** Unique identifier for the plugin (used as segment ID: plugin:<id>) */
  readonly id: string;

  /** Shell command to execute */
  readonly command: string;

  /** Emoji to display (hidden with --no-emojis) */
  readonly emoji?: string;

  /** Alternative text when emojis are disabled */
  readonly fallbackText?: string;

  /** Cache TTL in seconds. 0 = no caching (always fetch) */
  readonly ttl: number;

  /** Refresh timing. When set, also considers session boundaries */
  readonly refreshOn?: PluginRefreshOn;

  /** Command timeout in milliseconds. Default: 5000 */
  readonly timeout?: number;

  /** Working directory for command execution */
  readonly workingDir?: string;

  /** Value to display when cache is missing or loading. Default: "…" */
  readonly fallbackValue?: string;

  /** Maximum output length in characters. Default: 32 */
  readonly maxLength?: number;
}

/**
 * Root structure of the plugins configuration file.
 */
export interface PluginsFile {
  readonly plugins: readonly PluginConfig[];
}

/**
 * Cache entry for a plugin's command output.
 */
export interface PluginCacheEntry {
  /** Command output (trimmed) */
  readonly value: string;

  /** ISO date string of last successful update */
  readonly updatedAt: string;

  /** Error message if last execution failed, null otherwise */
  readonly error: string | null;

  /** Session ID for session_start refresh detection */
  readonly sessionId?: string;
}

/**
 * Default values for optional plugin configuration fields.
 */
export const PLUGIN_DEFAULTS = {
  timeout: 5000,
  fallbackValue: '…',
  maxLength: 32,
} as const;

/**
 * Maximum allowed timeout in milliseconds.
 */
export const MAX_PLUGIN_TIMEOUT_MS = 30000;

/**
 * Minimum allowed TTL in seconds (0 is allowed for no caching).
 */
export const MIN_PLUGIN_TTL_SECONDS = 0;

/**
 * Plugin cache directory name (under main cache directory).
 */
export const PLUGIN_CACHE_DIR_NAME = 'plugins';
