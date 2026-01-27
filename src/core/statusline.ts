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
  DEFAULT_RENDER_OPTIONS,
  type CostSegmentData,
} from './formatter.js';
import { readCacheSyncWithMtime, isLockFileFresh } from './cache-reader.js';
import {
  getContextLowThreshold,
  getContextMediumThreshold,
  getSubscriptionCacheTtl,
  getSegmentsConfig,
  getEmojisEnabled,
  getBarsEnabled,
} from '../config/env.js';
import { formatResetTime } from '../utils/time.js';
import type { RenderOptions } from './formatter.js';

/**
 * Canonical segment identifiers.
 */
export type SegmentId = 'model' | 'cost_session' | 'context' | 'subscription_usage';

/**
 * Default segment order (matches original hardcoded behavior).
 */
export const DEFAULT_SEGMENT_ORDER: readonly SegmentId[] = [
  'model',
  'cost_session',
  'context',
  'subscription_usage',
] as const;

/**
 * Alias mappings to canonical identifiers.
 * Keys are lowercase for case-insensitive lookup.
 */
const SEGMENT_ALIASES: Record<string, SegmentId> = {
  // Canonical (identity)
  model: 'model',
  cost_session: 'cost_session',
  context: 'context',
  subscription_usage: 'subscription_usage',

  // Cost aliases
  cost: 'cost_session',
  cost_usd: 'cost_session',
  cost_sess: 'cost_session',
  sess: 'cost_session',

  // Context aliases
  ctx: 'context',

  // Subscription aliases
  usage: 'subscription_usage',
  subscription: 'subscription_usage',
  sub_usage: 'subscription_usage',
  sub: 'subscription_usage',
};

/**
 * Normalizes a segment identifier to its canonical form.
 *
 * @param id - User-provided segment identifier
 * @returns Canonical SegmentId or null if unknown
 */
export function normalizeSegmentId(id: string): SegmentId | null {
  const normalized = id.trim().toLowerCase();
  if (normalized === '') {
    return null;
  }
  return SEGMENT_ALIASES[normalized] ?? null;
}

/**
 * Parses a comma-separated segment list string.
 *
 * - Normalizes aliases to canonical identifiers
 * - Ignores unknown identifiers (no error)
 * - Removes duplicates (keeps first occurrence)
 *
 * @param csv - Comma-separated segment identifiers
 * @returns Array of canonical SegmentIds (may be empty)
 */
export function parseSegmentList(csv: string): SegmentId[] {
  const seen = new Set<SegmentId>();
  const result: SegmentId[] = [];

  const parts = csv.split(',');
  for (const part of parts) {
    const canonical = normalizeSegmentId(part);
    if (canonical !== null && !seen.has(canonical)) {
      seen.add(canonical);
      result.push(canonical);
    }
  }

  return result;
}

/**
 * Resolves the final segment order based on CLI args and environment.
 *
 * Resolution order:
 * 1. If CLI flag is present (cliValue !== undefined):
 *    - Parse it; if valid segments found, use them
 *    - If empty/invalid, use DEFAULT (do NOT fall back to env)
 * 2. If CLI flag is NOT present (cliValue === undefined):
 *    - Check environment variable CCSTATUSLINE_SEGMENTS
 *    - If set and valid, use it; otherwise use DEFAULT
 *
 * @param cliValue - Value from CLI --segments or -s flag (undefined if flag not present, '' if present but no value)
 * @param envValue - Optional explicit env value (used for testing). If undefined, reads from process.env.
 * @returns Final segment order to use
 */
export function resolveSegmentOrder(
  cliValue: string | undefined,
  envValue?: string
): readonly SegmentId[] {
  // 1. If CLI flag is present (even if empty/invalid), use CLI result or DEFAULT
  //    Do NOT fall back to env when CLI flag is present
  if (cliValue !== undefined) {
    if (cliValue.trim() !== '') {
      const parsed = parseSegmentList(cliValue);
      if (parsed.length > 0) {
        return parsed;
      }
    }
    // CLI flag present but empty/invalid => use DEFAULT (no env fallback)
    return DEFAULT_SEGMENT_ORDER;
  }

  // 2. CLI flag not present => consult environment variable
  const envSegments = envValue ?? getSegmentsConfig();
  if (envSegments !== undefined && envSegments.trim() !== '') {
    const parsed = parseSegmentList(envSegments);
    if (parsed.length > 0) {
      return parsed;
    }
  }

  // 3. Default
  return DEFAULT_SEGMENT_ORDER;
}

/**
 * Resolves render options with precedence: CLI > env > default.
 *
 * @param noEmojisCli - true if --no-emojis flag present, undefined otherwise
 * @param noBarsCli - true if --no-bars flag present, undefined otherwise
 * @returns Resolved render options
 */
export function resolveRenderOptions(
  noEmojisCli: boolean | undefined,
  noBarsCli: boolean | undefined
): RenderOptions {
  const emojisFromEnv = getEmojisEnabled();
  const barsFromEnv = getBarsEnabled();

  return {
    showEmojis: noEmojisCli !== undefined ? !noEmojisCli : emojisFromEnv,
    showBars: noBarsCli !== undefined ? !noBarsCli : barsFromEnv,
  };
}

/**
 * Cache target identifiers for background update scheduling.
 */
export type CacheTargetId = 'subscriptionUsage';

/**
 * Mapping from segment identifiers to required cache targets.
 */
const SEGMENT_CACHE_TARGETS: Record<SegmentId, readonly CacheTargetId[]> = {
  model: [],
  cost_session: [],
  context: [],
  subscription_usage: ['subscriptionUsage'],
};

/**
 * Gets the list of cache targets required for the given segments.
 *
 * @param segments - Array of segment identifiers
 * @returns Array of cache target identifiers (deduplicated)
 */
export function getCacheTargetsForSegments(segments: readonly SegmentId[]): CacheTargetId[] {
  const targets = new Set<CacheTargetId>();
  for (const seg of segments) {
    for (const target of SEGMENT_CACHE_TARGETS[seg]) {
      targets.add(target);
    }
  }
  return [...targets];
}

/**
 * Gets the TTL in seconds for a given cache target.
 *
 * @param target - Cache target identifier
 * @returns TTL in seconds
 */
export function getCacheTargetTtlSeconds(target: CacheTargetId): number {
  switch (target) {
    case 'subscriptionUsage':
      return getSubscriptionCacheTtl();
  }
}

/**
 * Options for background update check.
 */
export interface BgUpdateCheckOptions {
  nowMs?: number;
  cooldownSeconds?: number;
}

/**
 * Determines whether a background cache update should be requested.
 *
 * Returns true if:
 * - At least one segment requires a cache target
 * - For any required cache target:
 *   - Cache is missing OR
 *   - Cache is expired (beyond TTL) OR
 *   - Cache has error/invalid payload
 * - NOT within cooldown period (based on lastAttemptAt)
 *
 * @param cacheDir - Cache directory path
 * @param segments - Array of segment identifiers
 * @param options - Optional check options (nowMs, cooldownSeconds)
 * @returns true if background update should be requested
 */
export function shouldRequestBgCacheUpdate(
  cacheDir: string,
  segments: readonly SegmentId[],
  options?: BgUpdateCheckOptions
): boolean {
  const targets = getCacheTargetsForSegments(segments);
  if (targets.length === 0) return false;

  // Skip if another update is already in progress (lock file exists and is fresh)
  if (isLockFileFresh(cacheDir)) return false;

  const nowMs = options?.nowMs ?? Date.now();
  const cooldownSeconds = options?.cooldownSeconds ?? 30;
  const cooldownMs = cooldownSeconds * 1000;

  let needsUpdate = false;

  for (const target of targets) {
    const ttl = getCacheTargetTtlSeconds(target);
    const cacheResult = readCacheSyncWithMtime(target, cacheDir, ttl);

    // Cooldown gate (per-target best-effort)
    if (cacheResult.entry !== null) {
      const lastAttempt = getLastAttemptAt(cacheResult.entry);
      if (lastAttempt !== null && nowMs - lastAttempt < cooldownMs) {
        // Do not request update for this target yet; keep checking others.
        continue;
      }
    }

    // Missing or stale cache => request update
    if (cacheResult.entry === null || !cacheResult.isFresh) {
      needsUpdate = true;
      continue;
    }

    // Fresh cache but error/invalid payload => request update
    // NOTE: validation must be target-specific when more targets are added.
    const valid = getValidSubscriptionUsage(cacheResult.entry);
    if (valid === null) {
      needsUpdate = true;
      continue;
    }
  }

  return needsUpdate;
}

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
 * Segment builder function type.
 * Returns the segment string, or empty string if the segment should be omitted.
 */
type SegmentBuilder = (input: ClaudeCodeInput, cacheDir: string, options: RenderOptions) => string;

/**
 * Creates the segment builder registry.
 * Each builder returns an empty string if the segment should be omitted.
 */
function createSegmentBuilders(): Record<SegmentId, SegmentBuilder> {
  return {
    model: (input, _cacheDir, options) => {
      const modelName = extractModelDisplayName(input);
      return formatModelSegment(modelName, options);
    },
    cost_session: (input, _cacheDir, options) => {
      const costData = buildCostSegmentData(input);
      return formatCostSegment(costData, options);
    },
    context: (input, _cacheDir, options) => {
      const tokenUsage = extractTokenUsage(input);
      return formatContextSegment(
        tokenUsage,
        getContextLowThreshold(),
        getContextMediumThreshold(),
        options
      );
    },
    subscription_usage: (_input, cacheDir, options) => {
      return buildSubscriptionUsageSegment(cacheDir, getSubscriptionCacheTtl(), options);
    },
  };
}

/**
 * Composes segments in the specified order.
 *
 * @param input - Parsed input
 * @param cacheDir - Cache directory
 * @param segmentOrder - Order of segments to render
 * @param renderOptions - Render options for emojis and bars
 */
function composeSegments(
  input: ClaudeCodeInput,
  cacheDir: string,
  segmentOrder: readonly SegmentId[],
  renderOptions: RenderOptions
): string[] {
  const builders = createSegmentBuilders();
  const segments: string[] = [];

  for (const segmentId of segmentOrder) {
    const builder = builders[segmentId];

    // Special case: subscription_usage only renders if we have other segments
    if (segmentId === 'subscription_usage' && segments.length === 0) {
      continue;
    }

    const segment = builder(input, cacheDir, renderOptions);
    if (segment !== '') {
      segments.push(segment);
    }
  }

  return segments;
}

/**
 * Builds the subscription usage segment from cache.
 */
function buildSubscriptionUsageSegment(
  cacheDir: string,
  ttlSeconds: number,
  options: RenderOptions
): string {
  const cache = readCacheSyncWithMtime('subscriptionUsage', cacheDir, ttlSeconds);
  const prefix = options.showEmojis ? '📦 ' : 'usage: ';

  if (cache.entry !== null && cache.isFresh) {
    const valid = getValidSubscriptionUsage(cache.entry);
    if (valid !== null) {
      const reset = formatResetTime(valid.resetsAt);
      if (reset !== '') {
        return formatSubscriptionUsageSegment(valid.utilizationPercent, reset, options);
      }
    }
  }

  if (cache.entry !== null) {
    const lastAttemptAt = getLastAttemptAt(cache.entry);
    if (lastAttemptAt !== null) {
      const ageSeconds = (Date.now() - lastAttemptAt) / 1000;
      if (ageSeconds < ttlSeconds) {
        return `${prefix}Fetch Error...`;
      }
    }
  }

  return `${prefix}Loading...`;
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
 * @param segments - Segment order (optional, defaults to DEFAULT_SEGMENT_ORDER)
 * @param renderOptions - Render options for emojis and bars (optional)
 * @returns A non-empty, single-line string
 */
export function generateStatusline(
  input: ClaudeCodeInput | null,
  cacheDir: string = DEFAULT_CACHE_DIR,
  segments?: readonly SegmentId[],
  renderOptions?: RenderOptions
): string {
  try {
    // Handle null/missing input
    if (input === null) {
      return FALLBACK_OUTPUT;
    }

    // Use provided segment order or default
    const segmentOrder = segments ?? DEFAULT_SEGMENT_ORDER;

    // Use provided render options or default
    const options = renderOptions ?? DEFAULT_RENDER_OPTIONS;

    // Compose all segments
    const composedSegments = composeSegments(input, cacheDir, segmentOrder, options);

    // If no segments, return fallback
    if (composedSegments.length === 0) {
      return FALLBACK_OUTPUT;
    }

    // Join segments with " | " separator
    const output = composedSegments.join(' | ');

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
