/**
 * Plugin segment builder for statusline.
 *
 * Builds segment strings from plugin configurations and cached values.
 */

import { PLUGIN_DEFAULTS, type PluginConfig } from '../types/plugin.js';
import { readPluginCacheSync, CURRENT_SESSION_ID } from './plugin-cache.js';
import type { RenderOptions } from './formatter.js';

/**
 * Prefix for plugin segment IDs in the segments list.
 */
export const PLUGIN_SEGMENT_PREFIX = 'plugin:';

/**
 * Check if a segment ID refers to a plugin.
 *
 * @param segmentId - Segment ID to check
 * @returns true if the segment ID starts with "plugin:"
 */
export function isPluginSegmentId(segmentId: string): boolean {
  return segmentId.startsWith(PLUGIN_SEGMENT_PREFIX);
}

/**
 * Extract the plugin ID from a plugin segment ID.
 *
 * @param segmentId - Segment ID (e.g., "plugin:git_branch")
 * @returns Plugin ID (e.g., "git_branch") or null if not a plugin segment
 */
export function parsePluginSegmentId(segmentId: string): string | null {
  if (!isPluginSegmentId(segmentId)) {
    return null;
  }
  return segmentId.slice(PLUGIN_SEGMENT_PREFIX.length);
}

/**
 * Get the effective fallback value for a plugin.
 */
function getEffectiveFallbackValue(config: PluginConfig): string {
  return config.fallbackValue ?? PLUGIN_DEFAULTS.fallbackValue;
}

/**
 * Format a plugin segment string from config and value.
 *
 * @param config - Plugin configuration
 * @param value - Value to display (command output or fallback)
 * @param options - Render options
 * @returns Formatted segment string
 */
export function formatPluginSegment(
  config: PluginConfig,
  value: string,
  options: RenderOptions
): string {
  // Use fallback value if value is empty
  const displayValue = value.trim() === '' ? getEffectiveFallbackValue(config) : value;

  // Determine prefix based on emoji/fallbackText and render options
  let prefix = '';
  if (options.showEmojis && config.emoji) {
    prefix = `${config.emoji} `;
  } else if (!options.showEmojis && config.fallbackText) {
    prefix = `${config.fallbackText}: `;
  }

  return `${prefix}${displayValue}`;
}

/**
 * Build a plugin segment by reading from cache.
 *
 * @param config - Plugin configuration
 * @param cacheDir - Base cache directory
 * @param options - Render options
 * @returns Formatted segment string
 */
export function buildPluginSegment(
  config: PluginConfig,
  cacheDir: string,
  options: RenderOptions
): string {
  // Determine TTL for cache read
  const ttl = config.ttl;
  const sessionId = config.refreshOn === 'session_start' ? CURRENT_SESSION_ID : undefined;

  // Try to read from cache
  const cached = readPluginCacheSync(config.id, cacheDir, ttl, sessionId);

  // If no cache or cache has error, use fallback
  if (cached === null || cached.error !== null || cached.value.trim() === '') {
    return formatPluginSegment(config, '', options);
  }

  return formatPluginSegment(config, cached.value, options);
}
