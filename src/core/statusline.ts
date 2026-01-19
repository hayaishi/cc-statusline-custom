/**
 * Statusline generation with legacy format parity.
 *
 * Output format:
 * 🤖 <Model> | 💰 $<session> sess / $<today> today / $<block> (<left>) | 🔥 $<rate>/hr | 🧠 <used>k/<limit>k [████░░░░] <pct>%
 */

import type { ClaudeCodeInput } from '../types/claude-code.js';
import type {
  DailyTotalEntry,
  BurnRateEntry,
  BlockInfoEntry,
  CacheEntryBase,
} from '../types/cache.js';
import { DEFAULT_CACHE_DIR, DEFAULT_CACHE_TTL_SECONDS } from '../types/cache.js';
import {
  extractModelDisplayName,
  extractSessionCost,
  extractTokenUsage,
} from './parser.js';
import {
  formatModelSegment,
  formatCostSegment,
  formatBurnRateSegment,
  formatContextSegment,
  type CostSegmentData,
} from './formatter.js';
import { readCacheSync } from './cache-reader.js';
import {
  getContextLowThreshold,
  getContextMediumThreshold,
} from '../config/env.js';

/**
 * Visible fallback output when no meaningful statusline can be generated.
 * MUST be non-empty to satisfy AGENTS.md "NEVER silent" requirement.
 */
export const FALLBACK_OUTPUT = '🤖 ? | ⏳ Loading...';

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
 * Type guard to check if cache entry is a BlockInfoEntry.
 */
function isBlockInfoEntry(entry: CacheEntryBase): entry is BlockInfoEntry {
  return 'cost_usd' in entry && 'remaining_seconds' in entry;
}

/**
 * Builds cost segment data from input and cache.
 */
function buildCostSegmentData(
  input: ClaudeCodeInput,
  cacheDir: string,
  ttlSeconds: number
): CostSegmentData {
  const data: CostSegmentData = {};

  // Session cost from input
  const sessionCost = extractSessionCost(input);
  if (sessionCost !== undefined) {
    (data as { sessionCost?: number }).sessionCost = sessionCost;
  }

  // Daily total from cache
  const dailyEntry = readCacheSync('dailyTotal', cacheDir, ttlSeconds);
  if (dailyEntry !== null && isDailyTotalEntry(dailyEntry)) {
    (data as { dailyTotal?: number }).dailyTotal = dailyEntry.cost_usd;
  }

  // Block info from cache
  const blockEntry = readCacheSync('blockInfo', cacheDir, ttlSeconds);
  if (blockEntry !== null && isBlockInfoEntry(blockEntry)) {
    (data as { blockCost?: number; blockTimeRemaining?: number }).blockCost = blockEntry.cost_usd;
    (data as { blockCost?: number; blockTimeRemaining?: number }).blockTimeRemaining = blockEntry.remaining_seconds;
  }

  return data;
}

/**
 * Composes all segments into the legacy format statusline.
 *
 * Segment order:
 * 1. Model: "🤖 Opus"
 * 2. Cost: "💰 $0.23 sess / $1.23 today / $0.45 (2h 45m left)"
 * 3. Burn rate: "🔥 $0.12/hr"
 * 4. Context: "🧠 25.0k/200k [████░░░░] 12%"
 */
function composeSegments(
  input: ClaudeCodeInput,
  cacheDir: string,
  ttlSeconds: number
): string[] {
  const segments: string[] = [];

  // 1. Model segment: "🤖 Opus"
  const modelName = extractModelDisplayName(input);
  const modelSegment = formatModelSegment(modelName);
  if (modelSegment !== '') {
    segments.push(modelSegment);
  }

  // 2. Cost segment: "💰 $0.23 sess / $1.23 today / $0.45 (2h 45m left)"
  const costData = buildCostSegmentData(input, cacheDir, ttlSeconds);
  const costSegment = formatCostSegment(costData);
  if (costSegment !== '') {
    segments.push(costSegment);
  }

  // 3. Burn rate segment: "🔥 $0.12/hr"
  const burnEntry = readCacheSync('burnRate', cacheDir, ttlSeconds);
  if (burnEntry !== null && isBurnRateEntry(burnEntry)) {
    const burnSegment = formatBurnRateSegment(burnEntry.rate_per_hour);
    if (burnSegment !== '') {
      segments.push(burnSegment);
    }
  }

  // 4. Context segment: "🧠 25.0k/200k [████░░░░] 12%"
  const tokenUsage = extractTokenUsage(input);
  const contextSegment = formatContextSegment(
    tokenUsage,
    getContextLowThreshold(),
    getContextMediumThreshold()
  );
  if (contextSegment !== '') {
    segments.push(contextSegment);
  }

  return segments;
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
 * Generates a statusline string from Claude Code input.
 *
 * Always reads from cache when available (unified extended mode).
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
export function generateStatusline(
  input: ClaudeCodeInput | null,
  cacheDir: string = DEFAULT_CACHE_DIR,
  ttlSeconds: number = DEFAULT_CACHE_TTL_SECONDS
): string {
  try {
    // Handle null/missing input
    if (input === null) {
      return FALLBACK_OUTPUT;
    }

    // Compose all segments
    const segments = composeSegments(input, cacheDir, ttlSeconds);

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
 * Alias for backward compatibility.
 * Previously this was a separate function; now unified with generateStatusline.
 */
export const generateStatuslineWithExtended = generateStatusline;
