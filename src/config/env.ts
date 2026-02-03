/**
 * Environment variable configuration for cc-statusline-custom.
 *
 * All getters are pure functions with O(1) complexity.
 * Invalid values fall back to safe defaults.
 */

import { DEFAULT_CACHE_DIR, DEFAULT_CACHE_TTL_SECONDS } from '../types/cache.js';
import { DEFAULT_CONTEXT_THRESHOLDS } from '../types/metrics.js';

function parseTtlSeconds(value: string | undefined, defaultSeconds: number): number {
  if (value === undefined) {
    return defaultSeconds;
  }

  const parsed = Math.floor(Number(value));
  if (Number.isNaN(parsed) || parsed <= 0) {
    return defaultSeconds;
  }

  return parsed;
}

/**
 * Gets whether extended metrics are enabled.
 * Extended metrics include subscription usage.
 *
 * @returns true if CCSTATUSLINE_EXTENDED_METRICS is "true" or "1"
 */
export function getExtendedMetricsEnabled(): boolean {
  const value = process.env.CCSTATUSLINE_EXTENDED_METRICS?.toLowerCase();
  return value === 'true' || value === '1';
}

/**
 * Gets the cache TTL in seconds.
 *
 * @returns Cache TTL (default: 60 seconds)
 */
export function getCacheTtl(): number {
  return parseTtlSeconds(process.env.CCSTATUSLINE_CACHE_TTL, DEFAULT_CACHE_TTL_SECONDS);
}

/**
 * Gets the subscription usage cache TTL in seconds.
 *
 * @returns Subscription cache TTL (default: 60 seconds)
 */
export function getSubscriptionCacheTtl(): number {
  return parseTtlSeconds(process.env.CCSTATUSLINE_SUBSCRIPTION_CACHE_TTL, DEFAULT_CACHE_TTL_SECONDS);
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

/**
 * Gets the context low threshold (green zone upper bound).
 *
 * @returns Threshold percentage 0-100 (default: 50)
 */
export function getContextLowThreshold(): number {
  const value = process.env.CCSTATUSLINE_CONTEXT_LOW_THRESHOLD;
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
  const value = process.env.CCSTATUSLINE_CONTEXT_MEDIUM_THRESHOLD;
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
 * @returns true if CCSTATUSLINE_DEBUG is "true" or "1"
 */
export function getDebugEnabled(): boolean {
  const value = process.env.CCSTATUSLINE_DEBUG?.toLowerCase();
  return value === 'true' || value === '1';
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
