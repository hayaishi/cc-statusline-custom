/**
 * Statusline generation with legacy format parity.
 *
 * Output format:
 * 🤖 <Model> | 💰 $<session> sess | 🧠 <used>k/<limit>k [████░░░░] <pct>% | 📦 <pct>% [████░░░░] (~h:mmam/pm)
 */

import type { ClaudeCodeInput } from '../types/claude-code.js';
import type { CacheEntry } from '../types/cache.js';
import { DEFAULT_CACHE_DIR } from '../types/cache.js';
import {
  extractModelDisplayName,
  extractSessionCost,
  extractTokenUsage,
} from './parser.js';
import {
  formatModelSegment,
  formatCostSegment,
  formatContextSegment,
  formatSubscriptionUsageSegment,
  type CostSegmentData,
} from './formatter.js';
import { readCacheSyncWithMtime } from './cache-reader.js';
import {
  getContextLowThreshold,
  getContextMediumThreshold,
  getSubscriptionCacheTtl,
} from '../config/env.js';
import { formatResetTime } from '../utils/time.js';

/**
 * Visible fallback output when no meaningful statusline can be generated.
 * MUST be non-empty to satisfy AGENTS.md "NEVER silent" requirement.
 */
export const FALLBACK_OUTPUT = '🤖 ? | ⏳ Loading...';

/**
 * Extracts a valid subscription usage payload from cache entry.
 */
function getValidSubscriptionUsage(
  entry: CacheEntry
): { utilizationPercent: number; resetsAt: string } | null {
  const record = entry as {
    utilizationPercent?: unknown;
    resetsAt?: unknown;
  };

  const percentValue = record.utilizationPercent;
  if (typeof percentValue !== 'number' || !Number.isInteger(percentValue)) {
    return null;
  }

  if (percentValue < 0 || percentValue > 100) {
    return null;
  }

  if (typeof record.resetsAt !== 'string') {
    return null;
  }

  if (!Number.isFinite(Date.parse(record.resetsAt))) {
    return null;
  }

  return { utilizationPercent: percentValue, resetsAt: record.resetsAt };
}

/**
 * Reads the last attempt timestamp from cache entry (if valid).
 */
function getLastAttemptAt(entry: CacheEntry): number | null {
  const record = entry as { lastAttemptAt?: unknown };
  if (typeof record.lastAttemptAt !== 'string') {
    return null;
  }

  const parsed = Date.parse(record.lastAttemptAt);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return parsed;
}

/**
 * Builds cost segment data from input.
 */
function buildCostSegmentData(input: ClaudeCodeInput): CostSegmentData {
  const data: CostSegmentData = {};

  // Session cost from input
  const sessionCost = extractSessionCost(input);
  if (sessionCost !== undefined) {
    (data as { sessionCost?: number }).sessionCost = sessionCost;
  }

  return data;
}

/**
 * Composes all segments into the legacy format statusline.
 *
 * Segment order:
 * 1. Model: "🤖 Opus"
 * 2. Cost: "💰 $0.23 sess"
 * 3. Context: "🧠 25.0k/200k [████░░░░] 12%"
 * 4. Subscription usage: "📦 55% [████░░░░] (~3:45pm)"
 */
function composeSegments(
  input: ClaudeCodeInput,
  cacheDir: string
): string[] {
  const segments: string[] = [];

  // 1. Model segment: "🤖 Opus"
  const modelName = extractModelDisplayName(input);
  const modelSegment = formatModelSegment(modelName);
  if (modelSegment !== '') {
    segments.push(modelSegment);
  }

  // 2. Cost segment: "💰 $0.23 sess"
  const costData = buildCostSegmentData(input);
  const costSegment = formatCostSegment(costData);
  if (costSegment !== '') {
    segments.push(costSegment);
  }

  // 3. Context segment: "🧠 25.0k/200k [████░░░░] 12%"
  const tokenUsage = extractTokenUsage(input);
  const contextSegment = formatContextSegment(
    tokenUsage,
    getContextLowThreshold(),
    getContextMediumThreshold()
  );
  if (contextSegment !== '') {
    segments.push(contextSegment);
  }

  // 4. Subscription usage segment: "📦 55% [████░░░░] (~3:45pm)"
  if (segments.length > 0) {
    const subscriptionSegment = buildSubscriptionUsageSegment(cacheDir, getSubscriptionCacheTtl());
    if (subscriptionSegment !== '') {
      segments.push(subscriptionSegment);
    }
  }

  return segments;
}

/**
 * Builds the subscription usage segment from cache.
 */
function buildSubscriptionUsageSegment(cacheDir: string, ttlSeconds: number): string {
  const cache = readCacheSyncWithMtime('subscriptionUsage', cacheDir, ttlSeconds);

  if (cache.entry !== null && cache.isFresh) {
    const valid = getValidSubscriptionUsage(cache.entry);
    if (valid !== null) {
      const reset = formatResetTime(valid.resetsAt);
      if (reset !== '') {
        return formatSubscriptionUsageSegment(valid.utilizationPercent, reset);
      }
    }
  }

  if (cache.entry !== null) {
    const lastAttemptAt = getLastAttemptAt(cache.entry);
    if (lastAttemptAt !== null) {
      const ageSeconds = (Date.now() - lastAttemptAt) / 1000;
      if (ageSeconds < ttlSeconds) {
        return '📦 Fetch Error...';
      }
    }
  }

  return '📦 Loading...';
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
 * Always reads subscription usage from cache when available.
 *
 * Guarantees:
 * - NEVER throws (catches all errors internally)
 * - ALWAYS returns a non-empty, visible single line
 * - Returns FALLBACK_OUTPUT on any error or missing input
 *
 * @param input - Parsed input from Claude Code, or null if parsing failed
 * @param cacheDir - Cache directory (optional, defaults to ~/.cache/ccusage-statusline)
 * @returns A non-empty, single-line string
 */
export function generateStatusline(
  input: ClaudeCodeInput | null,
  cacheDir: string = DEFAULT_CACHE_DIR
): string {
  try {
    // Handle null/missing input
    if (input === null) {
      return FALLBACK_OUTPUT;
    }

    // Compose all segments
    const segments = composeSegments(input, cacheDir);

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
