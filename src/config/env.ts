/**
 * Environment variable configuration for ccusage-statusline.
 *
 * All getters are pure functions with O(1) complexity.
 * Invalid values fall back to safe defaults.
 */

import { DEFAULT_CACHE_DIR, DEFAULT_CACHE_TTL_SECONDS } from '../types/cache.js';
import { DEFAULT_CONTEXT_THRESHOLDS } from '../types/metrics.js';

/**
 * Gets whether extended metrics are enabled.
 * Extended metrics include daily total, block info, and burn rate.
 *
 * @returns true if CCUSAGE_EXTENDED_METRICS is "true" or "1"
 */
export function getExtendedMetricsEnabled(): boolean {
  const value = process.env.CCUSAGE_EXTENDED_METRICS?.toLowerCase();
  return value === 'true' || value === '1';
}

/**
 * Gets the cache TTL in seconds.
 *
 * @returns Cache TTL (default: 60 seconds)
 */
export function getCacheTtl(): number {
  const value = process.env.CCUSAGE_CACHE_TTL;
  if (value === undefined) {
    return DEFAULT_CACHE_TTL_SECONDS;
  }

  const parsed = Math.floor(Number(value));
  if (Number.isNaN(parsed) || parsed <= 0) {
    return DEFAULT_CACHE_TTL_SECONDS;
  }

  return parsed;
}

/**
 * Gets the cache directory path.
 *
 * @returns Cache directory path (default: ~/.cache/ccusage-statusline)
 */
export function getCacheDir(): string {
  const value = process.env.CCUSAGE_CACHE_DIR?.trim();
  if (value === undefined || value === '') {
    return DEFAULT_CACHE_DIR;
  }
  return value;
}

/**
 * Gets the context low threshold (green zone upper bound).
 *
 * @returns Threshold percentage 0-100 (default: 50)
 */
export function getContextLowThreshold(): number {
  const value = process.env.CCUSAGE_CONTEXT_LOW_THRESHOLD;
  if (value === undefined) {
    return DEFAULT_CONTEXT_THRESHOLDS.low;
  }

  const parsed = Math.floor(Number(value));
  if (Number.isNaN(parsed)) {
    return DEFAULT_CONTEXT_THRESHOLDS.low;
  }

  return Math.max(0, Math.min(100, parsed));
}

/**
 * Gets the context medium threshold (yellow zone upper bound).
 *
 * @returns Threshold percentage 0-100 (default: 80)
 */
export function getContextMediumThreshold(): number {
  const value = process.env.CCUSAGE_CONTEXT_MEDIUM_THRESHOLD;
  if (value === undefined) {
    return DEFAULT_CONTEXT_THRESHOLDS.medium;
  }

  const parsed = Math.floor(Number(value));
  if (Number.isNaN(parsed)) {
    return DEFAULT_CONTEXT_THRESHOLDS.medium;
  }

  return Math.max(0, Math.min(100, parsed));
}

/**
 * Gets whether debug mode is enabled.
 *
 * @returns true if CCUSAGE_DEBUG is "true" or "1"
 */
export function getDebugEnabled(): boolean {
  const value = process.env.CCUSAGE_DEBUG?.toLowerCase();
  return value === 'true' || value === '1';
}
