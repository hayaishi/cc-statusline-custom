/**
 * Plugin segment builder for statusline.
 */

import { PLUGIN_DEFAULTS, type PluginConfig } from '../types/plugin.js';
import { readPluginCacheSync, CURRENT_SESSION_ID } from './plugin-cache.js';
import type { RenderOptions } from './formatter.js';

export const PLUGIN_SEGMENT_PREFIX = 'plugin:';

export function isPluginSegmentId(segmentId: string): boolean {
  return segmentId.startsWith(PLUGIN_SEGMENT_PREFIX);
}

export function parsePluginSegmentId(segmentId: string): string | null {
  if (!isPluginSegmentId(segmentId)) {
    return null;
  }
  return segmentId.slice(PLUGIN_SEGMENT_PREFIX.length);
}

export function formatPluginSegment(
  config: PluginConfig,
  value: string,
  options: RenderOptions
): string {
  const displayValue = value.trim() === ''
    ? (config.fallbackValue ?? PLUGIN_DEFAULTS.fallbackValue)
    : value;

  let prefix = '';
  if (options.showEmojis && config.emoji !== undefined) {
    prefix = `${config.emoji} `;
  } else if (!options.showEmojis && config.fallbackText !== undefined) {
    prefix = `${config.fallbackText}: `;
  }

  return `${prefix}${displayValue}`;
}

export function buildPluginSegment(
  config: PluginConfig,
  cacheDir: string,
  options: RenderOptions
): string {
  const sessionId = config.refreshOn === 'session_start' ? CURRENT_SESSION_ID : undefined;
  const cached = readPluginCacheSync(config.id, cacheDir, config.ttl, sessionId);

  // Pass raw value through; formatPluginSegment applies fallbackValue when value is empty
  const value = cached !== null && cached.error === null && typeof cached.value === 'string'
    ? cached.value
    : '';
  return formatPluginSegment(config, value, options);
}
