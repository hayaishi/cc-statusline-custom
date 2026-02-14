/**
 * Environment variable configuration for cc-statusline-custom.
 *
 * All getters are pure functions with O(1) complexity.
 * Invalid values fall back to safe defaults.
 */

import { join } from 'node:path';

import { DEFAULT_CACHE_DIR, DEFAULT_CACHE_TTL_SECONDS } from '../types/cache.js';
import { DEFAULT_CONTEXT_THRESHOLDS } from '../types/metrics.js';

const DEFAULT_DEBUG_LOG_MAX_BYTES = 1024 * 1024;
const DEFAULT_DEBUG_LOG_MAX_FILES = 5;

function parsePositiveInt(value: string | undefined, defaultValue: number): number {
  if (value === undefined) {
    return defaultValue;
  }

  const parsed = Math.floor(Number(value));
  if (Number.isNaN(parsed) || parsed <= 0) {
    return defaultValue;
  }

  return parsed;
}

function parseTtlSeconds(value: string | undefined, defaultSeconds: number): number {
  return parsePositiveInt(value, defaultSeconds);
}

/**
 * Gets the cache TTL in seconds.
 *
 * @returns Cache TTL (default: 60 seconds)
 */
export function getCacheTtl(): number {
  return parseTtlSeconds(process.env.CCSTATUSLINE_PLUGIN_CACHE_TTL, DEFAULT_CACHE_TTL_SECONDS);
}

/**
 * Gets the cache directory path.
 *
 * @returns Cache directory path (default: ~/.cache/cc-statusline-custom)
 */
export function getCacheDir(): string {
  const value = process.env.CCSTATUSLINE_CACHE_DIR?.trim();
  if (value === undefined || value === '') {
    return DEFAULT_CACHE_DIR;
  }
  return value;
}

function parseThresholdPercent(value: string | undefined, defaultPercent: number): number {
  if (value === undefined) {
    return defaultPercent;
  }

  const parsed = Math.floor(Number(value));
  if (Number.isNaN(parsed)) {
    return defaultPercent;
  }

  return Math.max(0, Math.min(100, parsed));
}

/**
 * Gets the context low threshold (green zone upper bound).
 *
 * @returns Threshold percentage 0-100 (default: 50)
 */
export function getContextLowThreshold(): number {
  return parseThresholdPercent(process.env.CCSTATUSLINE_CONTEXT_LOW_THRESHOLD, DEFAULT_CONTEXT_THRESHOLDS.low);
}

/**
 * Gets the context medium threshold (yellow zone upper bound).
 *
 * @returns Threshold percentage 0-100 (default: 80)
 */
export function getContextMediumThreshold(): number {
  return parseThresholdPercent(process.env.CCSTATUSLINE_CONTEXT_MEDIUM_THRESHOLD, DEFAULT_CONTEXT_THRESHOLDS.medium);
}

/**
 * Gets whether debug mode is enabled.
 *
 * @returns true if CCSTATUSLINE_DEBUG is "true" or "1"
 */
export function getDebugEnabled(): boolean {
  const value = process.env.CCSTATUSLINE_DEBUG?.toLowerCase();
  return value === 'true' || value === '1';
}

/**
 * Gets the debug log file path.
 *
 * @returns Debug log file path
 */
export function getDebugLogPath(): string {
  const value = process.env.CCSTATUSLINE_DEBUG_LOG_PATH?.trim();
  if (value === undefined || value === '') {
    return join(getCacheDir(), 'debug', 'statusline-debug.log');
  }
  return value;
}

/**
 * Gets the maximum debug log file size in bytes.
 *
 * @returns Maximum debug log file size (default: 1 MiB)
 */
export function getDebugLogMaxBytes(): number {
  return parsePositiveInt(process.env.CCSTATUSLINE_DEBUG_LOG_MAX_BYTES, DEFAULT_DEBUG_LOG_MAX_BYTES);
}

/**
 * Gets the number of rotated debug log files to retain.
 *
 * @returns Maximum rotated debug log files (default: 5)
 */
export function getDebugLogMaxFiles(): number {
  return parsePositiveInt(process.env.CCSTATUSLINE_DEBUG_LOG_MAX_FILES, DEFAULT_DEBUG_LOG_MAX_FILES);
}

/**
 * Gets the raw segments configuration from environment.
 * Normalization and parsing happens in statusline.ts.
 *
 * @returns Raw segments string or undefined if not set/empty
 */
export function getSegmentsConfig(): string | undefined {
  const value = process.env.CCSTATUSLINE_SEGMENTS?.trim();
  if (value === undefined || value === '') {
    return undefined;
  }
  return value;
}

/**
 * Gets whether emojis are enabled.
 *
 * @returns false if CCSTATUSLINE_NO_EMOJIS is "true" or "1", true otherwise
 */
export function getEmojisEnabled(): boolean {
  const value = process.env.CCSTATUSLINE_NO_EMOJIS?.toLowerCase();
  return !(value === 'true' || value === '1');
}

/**
 * Gets whether progress bars are enabled.
 *
 * @returns false if CCSTATUSLINE_NO_BARS is "true" or "1", true otherwise
 */
export function getBarsEnabled(): boolean {
  const value = process.env.CCSTATUSLINE_NO_BARS?.toLowerCase();
  return !(value === 'true' || value === '1');
}

/**
 * Gets the plugin config file path from environment.
 *
 * @returns CCSTATUSLINE_PLUGIN_CONFIG value if set, undefined otherwise
 */
export function getPluginConfigPath(): string | undefined {
  const value = process.env.CCSTATUSLINE_PLUGIN_CONFIG?.trim();
  if (value === undefined || value === '') {
    return undefined;
  }
  return value;
}
