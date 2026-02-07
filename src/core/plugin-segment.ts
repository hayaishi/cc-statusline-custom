import { PLUGIN_DEFAULTS, type PluginConfig } from '../types/plugin.js';
import { readPluginCacheForDisplay } from './plugin-cache.js';
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
  options: RenderOptions,
  projectDir?: string
): string {
  const effectiveWorkingDir = config.workingDir ?? projectDir;

  // Stale-while-revalidate with max-age safety limit:
  // - Fresh (< TTL): display cache, no refresh
  // - Stale (TTL to max-age): display cache, trigger refresh
  // - Expired (> max-age): display fallback, trigger refresh
  const cached = readPluginCacheForDisplay(config.id, cacheDir, effectiveWorkingDir);

  const value = cached !== null && cached.error === null ? cached.value : '';
  return formatPluginSegment(config, value, options);
}
