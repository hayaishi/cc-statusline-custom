import type { ClaudeCodeInput } from '../types/claude-code.js';
import type { DailyTotalEntry, BurnRateEntry, CacheEntryBase } from '../types/cache.js';
import { DEFAULT_CACHE_DIR, DEFAULT_CACHE_TTL_SECONDS } from '../types/cache.js';
import {
  extractModelDisplayName,
  extractSessionCost,
  extractContextUsage,
} from './parser.js';
import {
  formatModelIndicator,
  formatSessionCost,
  formatContextUsage,
  formatDailyTotal,
  formatBurnRate,
} from './formatter.js';
import { readCacheSync } from './cache-reader.js';

/**
 * Visible fallback output when no meaningful statusline can be generated.
 * MUST be non-empty to satisfy AGENTS.md "NEVER silent" requirement.
 */
export const FALLBACK_OUTPUT = '? | Loading...';

/**
 * Composes the fast-path statusline segments.
 * Returns array of non-empty segments.
 */
function composeFastPathSegments(input: ClaudeCodeInput): string[] {
  const segments: string[] = [];

  // Model indicator
  const modelName = extractModelDisplayName(input);
  const modelSegment = formatModelIndicator(modelName);
  if (modelSegment !== '') {
    segments.push(modelSegment);
  }

  // Session cost
  const cost = extractSessionCost(input);
  const costSegment = formatSessionCost(cost);
  if (costSegment !== '') {
    segments.push(costSegment);
  }

  // Context usage
  const usage = extractContextUsage(input);
  const usageSegment = formatContextUsage(usage);
  if (usageSegment !== '') {
    segments.push(usageSegment);
  }

  return segments;
}

/**
 * Generates a statusline string from Claude Code input.
 *
 * Guarantees:
 * - NEVER throws (catches all errors internally)
 * - ALWAYS returns a non-empty, visible single line
 * - Returns FALLBACK_OUTPUT on any error or missing input
 *
 * @param input - Parsed input from Claude Code, or null if parsing failed
 * @returns A non-empty, single-line string
 */
export function generateStatusline(input: ClaudeCodeInput | null): string {
  try {
    // Handle null/missing input
    if (input === null) {
      return FALLBACK_OUTPUT;
    }

    // Compose fast-path segments
    const segments = composeFastPathSegments(input);

    // If no segments, return fallback
    if (segments.length === 0) {
      return FALLBACK_OUTPUT;
    }

    // Join segments with " | " separator
    const output = segments.join(' | ');

    // Ensure single line and non-empty output
    return ensureVisibleOutput(output);
  } catch {
    // Ultimate safety net: never throw, always return visible fallback
    return FALLBACK_OUTPUT;
  }
}

/**
 * Ensures the output is a single visible line.
 * Takes only the first line and falls back if result is empty/whitespace.
 */
function ensureVisibleOutput(text: string): string {
  const firstLine = text.split('\n')[0] ?? '';
  const trimmed = firstLine.trim();

  // Never return empty or whitespace-only output
  if (trimmed === '') {
    return FALLBACK_OUTPUT;
  }

  return firstLine;
}

/**
 * Type guard to check if cache entry is a DailyTotalEntry.
 */
function isDailyTotalEntry(entry: CacheEntryBase): entry is DailyTotalEntry {
  return 'cost_usd' in entry && 'date' in entry;
}

/**
 * Type guard to check if cache entry is a BurnRateEntry.
 */
function isBurnRateEntry(entry: CacheEntryBase): entry is BurnRateEntry {
  return 'rate_per_hour' in entry;
}

/**
 * Composes extended metrics segments from cache.
 * Returns array of non-empty segments.
 */
function composeExtendedSegments(
  cacheDir: string,
  ttlSeconds: number
): string[] {
  const segments: string[] = [];

  // Daily total
  const dailyEntry = readCacheSync('dailyTotal', cacheDir, ttlSeconds);
  if (dailyEntry !== null && isDailyTotalEntry(dailyEntry)) {
    const dailySegment = formatDailyTotal(dailyEntry.cost_usd);
    if (dailySegment !== '') {
      segments.push(dailySegment);
    }
  }

  // Burn rate
  const burnEntry = readCacheSync('burnRate', cacheDir, ttlSeconds);
  if (burnEntry !== null && isBurnRateEntry(burnEntry)) {
    const burnSegment = formatBurnRate(burnEntry.rate_per_hour);
    if (burnSegment !== '') {
      segments.push(burnSegment);
    }
  }

  return segments;
}

/**
 * Generates a statusline string with extended metrics from cache.
 *
 * This function includes both fast-path metrics (model, cost, context %)
 * and extended metrics from cache (daily total, burn rate) when available.
 *
 * Guarantees:
 * - NEVER throws (catches all errors internally)
 * - ALWAYS returns a non-empty, visible single line
 * - Returns FALLBACK_OUTPUT on any error or missing input
 *
 * @param input - Parsed input from Claude Code, or null if parsing failed
 * @param cacheDir - Cache directory (optional, defaults to ~/.cache/ccusage-statusline)
 * @param ttlSeconds - Cache TTL in seconds (optional, defaults to 60)
 * @returns A non-empty, single-line string
 */
export function generateStatuslineWithExtended(
  input: ClaudeCodeInput | null,
  cacheDir: string = DEFAULT_CACHE_DIR,
  ttlSeconds: number = DEFAULT_CACHE_TTL_SECONDS
): string {
  try {
    // Handle null/missing input
    if (input === null) {
      return FALLBACK_OUTPUT;
    }

    // Compose fast-path segments
    const fastPathSegments = composeFastPathSegments(input);

    // Compose extended segments from cache
    const extendedSegments = composeExtendedSegments(cacheDir, ttlSeconds);

    // Combine all segments
    const allSegments = [...fastPathSegments, ...extendedSegments];

    // If no segments, return fallback
    if (allSegments.length === 0) {
      return FALLBACK_OUTPUT;
    }

    // Join segments with " | " separator
    const output = allSegments.join(' | ');

    // Ensure single line and non-empty output
    return ensureVisibleOutput(output);
  } catch {
    // Ultimate safety net: never throw, always return visible fallback
    return FALLBACK_OUTPUT;
  }
}
