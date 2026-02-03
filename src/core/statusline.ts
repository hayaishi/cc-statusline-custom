/**
 * Statusline generation with legacy format parity.
 *
 * Output format:
 * 🤖 <Model> | 💰 $<session> | 🧠 <used>k/<limit>k [████░░░░] <pct>% | ⌛️ <pct>% [████░░░░] (~h:mmam/pm)
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
  formatSubscriptionUsageAllSegment,
  formatSubscriptionUsagePrefix,
  NORMAL_SUB_BAR_WIDTH,
  DEFAULT_RENDER_OPTIONS,
  type CostSegmentData,
  type WindowData,
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
import { formatResetTime, normalizeSubscriptionResetTime } from '../utils/time.js';
import type { RenderOptions } from './formatter.js';

/**
 * Canonical segment identifiers.
 */
export type SegmentId = 'model' | 'cost_session' | 'context' | 'subscription_usage' | 'subscription_usage_all';

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

  // Subscription all aliases
  subscription_usage_all: 'subscription_usage_all',
  sub_all: 'subscription_usage_all',
  usage_all: 'subscription_usage_all',
};

/**
 * Normalizes a segment identifier to its canonical form.
 *
 * Example: "ctx" → "context", "sub" → "subscription_usage"
 *
 * @param id - User-provided segment identifier
 * @returns Canonical SegmentId or null if unknown/empty
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
 * Example: "model,ctx,sub" → ["model", "context", "subscription_usage"]
 *
 * Behavior:
 * - Normalizes aliases to canonical identifiers (ctx → context)
 * - Ignores unknown identifiers (no error)
 * - Removes duplicates (keeps first occurrence)
 *
 * @param csv - Comma-separated segment identifiers
 * @returns Array of canonical SegmentIds (may be empty if all unknown)
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
 * Precedence (highest to lowest):
 * 1. CLI flag (--segments or -s): if present, ONLY use CLI value or DEFAULT
 *    - Does NOT fall back to env when CLI flag is present (even if invalid)
 * 2. Environment variable (CCSTATUSLINE_SEGMENTS): if CLI not present
 * 3. DEFAULT_SEGMENT_ORDER: if both CLI and env absent/invalid
 *
 * @param cliValue - Value from CLI --segments or -s flag (undefined if flag not present, '' if present but no value)
 * @param envValue - Optional explicit env value (used for testing). If undefined, reads from process.env.
 * @returns Final segment order to use
 */
export function resolveSegmentOrder(
  cliValue: string | undefined,
  envValue?: string
): readonly SegmentId[] {
  // CLI flag present (even if empty/invalid) => use CLI result or DEFAULT
  // IMPORTANT: Do NOT fall back to env when CLI flag is present
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

  // CLI flag not present => check environment variable
  const envSegments = envValue ?? getSegmentsConfig();
  if (envSegments !== undefined && envSegments.trim() !== '') {
    const parsed = parseSegmentList(envSegments);
    if (parsed.length > 0) {
      return parsed;
    }
  }

  // Both CLI and env absent/invalid => use default
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
  subscription_usage_all: ['subscriptionUsage'],
};

/**
 * Gets the list of cache targets required for the given segments.
 *
 * Example: ["model", "subscription_usage"] → ["subscriptionUsage"]
 *
 * @param segments - Array of segment identifiers
 * @returns Array of cache target identifiers (deduplicated)
 */
export function getCacheTargetsForSegments(segments: readonly SegmentId[]): CacheTargetId[] {
  const allTargets = segments.flatMap(seg => SEGMENT_CACHE_TARGETS[seg]);
  return [...new Set(allTargets)];
}

/**
 * Gets the TTL in seconds for a given cache target.
 *
 * @param target - Cache target identifier
 * @returns TTL in seconds
 */
export function getCacheTargetTtlSeconds(_target: CacheTargetId): number {
  return getSubscriptionCacheTtl();
}

/**
 * Options for background update check.
 */
export interface BgUpdateCheckOptions {
  nowMs?: number;
  cooldownSeconds?: number;
}

/**
 * Checks if a cache entry is within the cooldown period since last attempt.
 *
 * @param entry - Cache entry (may be null)
 * @param nowMs - Current time in milliseconds
 * @param cooldownMs - Cooldown period in milliseconds
 * @returns true if within cooldown (too soon to retry)
 */
function isWithinCooldown(entry: CacheEntry | null, nowMs: number, cooldownMs: number): boolean {
  if (entry === null) return false;

  const lastAttemptMs = getLastAttemptAt(entry);
  if (lastAttemptMs === null) return false;

  return nowMs - lastAttemptMs < cooldownMs;
}

/**
 * Checks if a cache entry has valid data.
 *
 * @param entry - Cache entry (may be null)
 * @param isFresh - Whether the cache is within TTL
 * @returns true if cache exists, is fresh, and has valid payload
 */
function isCacheValid(entry: CacheEntry | null, isFresh: boolean): boolean {
  if (entry === null || !isFresh) return false;

  // NOTE: validation must be target-specific when more targets are added.
  const valid = getValidSubscriptionUsage(entry);
  return valid !== null;
}

/**
 * Determines whether a background cache update should be requested.
 *
 * Returns true when ALL conditions are met:
 * - At least one segment requires a cache target
 * - Update lock is NOT held (no concurrent update in progress)
 * - At least one cache target needs refresh due to:
 *   - Missing cache file
 *   - Expired cache (beyond TTL)
 *   - Invalid/corrupt cache payload
 * - NOT within cooldown period since last attempt (prevents spawn storms)
 *
 * @param cacheDir - Cache directory path
 * @param segments - Array of segment identifiers
 * @param options - Optional check options (nowMs, cooldownSeconds default: 30)
 * @returns true if background update should be requested
 */
export function shouldRequestBgCacheUpdate(
  cacheDir: string,
  segments: readonly SegmentId[],
  options?: BgUpdateCheckOptions
): boolean {
  const targets = getCacheTargetsForSegments(segments);
  if (targets.length === 0) return false;

  if (isLockFileFresh(cacheDir)) return false;

  const nowMs = options?.nowMs ?? Date.now();
  const cooldownMs = (options?.cooldownSeconds ?? 30) * 1000;

  // Return true if ANY target needs update
  return targets.some(target => {
    const ttl = getCacheTargetTtlSeconds(target);
    const { entry, isFresh } = readCacheSyncWithMtime(target, cacheDir, ttl);

    // Skip this target if within cooldown (prevents spawn storms)
    if (isWithinCooldown(entry, nowMs, cooldownMs)) {
      return false; // Not ready for update; try other targets
    }

    // Needs update if cache is invalid (missing, stale, or corrupt)
    return !isCacheValid(entry, isFresh);
  });
}

/**
 * Visible fallback output when no meaningful statusline can be generated.
 * MUST be non-empty to satisfy AGENTS.md "NEVER silent" requirement.
 */
export const FALLBACK_OUTPUT = '🤖 ? | ⏳ Loading...';

/**
 * Validates and extracts subscription usage payload from cache entry.
 *
 * Returns null if any validation fails:
 * - utilizationPercent must be integer 0-100
 * - resetsAt must be valid ISO date string
 *
 * @returns Validated payload or null if invalid
 */
function getValidSubscriptionUsage(
  entry: CacheEntry
): { utilizationPercent: number; resetsAt: string } | null {
  const record = entry as {
    utilizationPercent?: unknown;
    resetsAt?: unknown;
  };

  // Validate utilizationPercent: must be integer 0-100
  const percentValue = record.utilizationPercent;
  if (typeof percentValue !== 'number' || !Number.isInteger(percentValue)) {
    return null;
  }
  if (percentValue < 0 || percentValue > 100) {
    return null;
  }

  // Validate resetsAt: must be parseable ISO date string
  if (typeof record.resetsAt !== 'string') {
    return null;
  }
  if (!Number.isFinite(Date.parse(record.resetsAt))) {
    return null;
  }

  return { utilizationPercent: percentValue, resetsAt: record.resetsAt };
}

/**
 * Extracts the last attempt timestamp from cache entry.
 *
 * Used for cooldown gating to prevent spawn storms.
 *
 * @returns Milliseconds since epoch, or null if missing/invalid
 */
function getLastAttemptAt(entry: CacheEntry): number | null {
  const record = entry as { lastAttemptAt?: unknown };
  if (typeof record.lastAttemptAt !== 'string') {
    return null;
  }

  const parsedMs = Date.parse(record.lastAttemptAt);
  if (!Number.isFinite(parsedMs)) {
    return null;
  }

  return parsedMs;
}

/**
 * Extracts cost data from input for cost segment rendering.
 *
 * Currently only extracts session cost; extensible for future cost types.
 */
function buildCostSegmentData(input: ClaudeCodeInput): CostSegmentData {
  const data: CostSegmentData = {};

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
function createSegmentBuilders(debug: boolean): Record<SegmentId, SegmentBuilder> {
  return {
    model: (input, _cacheDir, options): string => {
      const modelName = extractModelDisplayName(input);
      return formatModelSegment(modelName, options);
    },
    cost_session: (input, _cacheDir, options): string => {
      const costData = buildCostSegmentData(input);
      return formatCostSegment(costData, options);
    },
    context: (input, _cacheDir, options): string => {
      const tokenUsage = extractTokenUsage(input);
      return formatContextSegment(
        tokenUsage,
        getContextLowThreshold(),
        getContextMediumThreshold(),
        options
      );
    },
    subscription_usage: (_input, cacheDir, options): string => {
      return buildSubscriptionUsageSegment(cacheDir, getSubscriptionCacheTtl(), options, debug);
    },
    subscription_usage_all: (_input, cacheDir, options): string => {
      return buildSubscriptionUsageAllSegment(cacheDir, getSubscriptionCacheTtl(), options, debug);
    },
  };
}

/**
 * Composes segments in the specified order, filtering empty results.
 *
 * Special rule: subscription_usage only renders if at least one other segment exists
 * (prevents showing only subscription usage with no context).
 *
 * @param input - Parsed input
 * @param cacheDir - Cache directory
 * @param segmentOrder - Order of segments to render
 * @param renderOptions - Render options for emojis and bars
 * @returns Array of non-empty segment strings
 */
function composeSegments(
  input: ClaudeCodeInput,
  cacheDir: string,
  segmentOrder: readonly SegmentId[],
  renderOptions: RenderOptions,
  debug: boolean
): string[] {
  const builders = createSegmentBuilders(debug);

  return segmentOrder.reduce<string[]>((segments, segmentId) => {
    const builder = builders[segmentId];

    // Subscription usage segments only show when other context exists (never standalone)
    const isSubscriptionSegment =
      segmentId === 'subscription_usage' || segmentId === 'subscription_usage_all';
    const hasNoOtherSegments = segments.length === 0;
    if (isSubscriptionSegment && hasNoOtherSegments) {
      return segments;
    }

    const renderedSegment = builder(input, cacheDir, renderOptions);
    const hasContent = renderedSegment !== '';
    if (hasContent) {
      segments.push(renderedSegment);
    }

    return segments;
  }, []);
}

/**
 * Checks if a failed cache fetch is recent (within TTL).
 *
 * Used to distinguish "Fetch Error" from "Loading" states.
 *
 * @param entry - Cache entry (may be null)
 * @param ttlSeconds - Cache TTL in seconds
 * @returns true if entry exists, has lastAttemptAt, and is within TTL
 */
function isRecentFetchError(entry: CacheEntry | null, ttlSeconds: number): boolean {
  if (entry === null) return false;

  const lastAttemptMs = getLastAttemptAt(entry);
  if (lastAttemptMs === null) return false;

  const ageSeconds = (Date.now() - lastAttemptMs) / 1000;
  return ageSeconds < ttlSeconds;
}

const MAX_FETCH_ERROR_DETAIL_LENGTH = 32;

function normalizeFetchErrorDetail(value: string): string {
  const singleLine = value.replace(/\s+/g, ' ').trim();
  if (singleLine.length <= MAX_FETCH_ERROR_DETAIL_LENGTH) {
    return singleLine;
  }
  const truncated = singleLine.slice(0, MAX_FETCH_ERROR_DETAIL_LENGTH - 3).trimEnd();
  return `${truncated}...`;
}

function formatFetchErrorMessage(entry: CacheEntry | null, debug: boolean): string {
  if (!debug) {
    return 'Fetch Error...';
  }

  if (entry === null) {
    return 'Fetch Error...';
  }

  const record = entry as { lastError?: unknown };
  if (typeof record.lastError !== 'string') {
    return 'Fetch Error...';
  }

  const trimmed = record.lastError.trim();
  if (trimmed === '') {
    return 'Fetch Error...';
  }

  const detail = normalizeFetchErrorDetail(trimmed);
  return `Fetch Error (${detail})`;
}

/**
 * Builds the subscription usage segment from cache.
 *
 * Returns one of:
 * - Formatted usage segment (if cache valid and fresh)
 * - "Fetch Error..." (or "Fetch Error (<detail>)" when debug is enabled)
 * - "Loading..." (if no cache or stale)
 *
 * @param cacheDir - Cache directory path
 * @param ttlSeconds - Cache time-to-live in seconds
 * @param options - Render options for emojis
 */
function buildSubscriptionUsageSegment(
  cacheDir: string,
  ttlSeconds: number,
  options: RenderOptions,
  debug: boolean
): string {
  const { entry, isFresh } = readCacheSyncWithMtime('subscriptionUsage', cacheDir, ttlSeconds);
  const entryWindow = entry !== null
    ? (entry as { window?: 'five_hours' | 'seven_days' }).window
    : undefined;
  const fallbackWindowType = entryWindow === 'seven_days' ? 'seven_days' : 'five_hours';
  const prefix = formatSubscriptionUsagePrefix(fallbackWindowType, options);

  // Happy path: fresh valid cache
  if (entry !== null && isFresh) {
    const valid = getValidSubscriptionUsage(entry);
    if (valid !== null) {
      const windowType = entryWindow;
      const reset = formatResetTime(normalizeSubscriptionResetTime(valid.resetsAt), windowType);
      if (reset !== '') {
        const primaryWindowType = fallbackWindowType;
        return formatSubscriptionUsageAllSegment(
          { percent: valid.utilizationPercent, reset },
          null,
          options,
          { primaryWindowType, barWidth: NORMAL_SUB_BAR_WIDTH }
        );
      }
    }
  }

  // Error state: recent fetch failed (within TTL)
  if (isRecentFetchError(entry, ttlSeconds)) {
    return `${prefix}${formatFetchErrorMessage(entry, debug)}`;
  }

  // Loading state: no cache or stale
  return `${prefix}Loading...`;
}

/**
 * Extracts and validates window data from cache entry.
 * Returns WindowData if valid (has integer percent and formatted reset time), null otherwise.
 */
function extractWindowData(
  window: { utilizationPercent?: unknown; resetsAt?: unknown } | undefined,
  windowType: 'five_hours' | 'seven_days'
): WindowData | null {
  if (!window) return null;

  const { utilizationPercent, resetsAt } = window;

  // Validate percent is an integer
  if (typeof utilizationPercent !== 'number' || !Number.isInteger(utilizationPercent)) {
    return null;
  }

  // Validate percent is in range 0-100 (align with getValidSubscriptionUsage)
  if (utilizationPercent < 0 || utilizationPercent > 100) {
    return null;
  }

  // Validate and format reset timestamp
  if (typeof resetsAt !== 'string') return null;
  const reset = formatResetTime(normalizeSubscriptionResetTime(resetsAt), windowType);
  if (reset === '') return null;

  return { percent: utilizationPercent, reset };
}

/**
 * Builds the subscription_usage_all segment showing both five_hours and seven_days windows.
 *
 * Returns formatted segment with both windows, or fallback messages:
 * - "⌛️ 55% [██░░] (~3:45pm)  🌙 55% [██░░] (~10:45pm, Feb 1)" (happy path)
 * - "⌛️ Fetch Error..." (or "⌛️ Fetch Error (<detail>)" when debug is enabled)
 * - "⌛️ Loading..." (no cache or stale)
 *
 * @param cacheDir - Cache directory path
 * @param ttlSeconds - Cache TTL in seconds
 * @param options - Render options for emojis and bars
 * @returns Formatted segment string or fallback message
 */
function buildSubscriptionUsageAllSegment(
  cacheDir: string,
  ttlSeconds: number,
  options: RenderOptions,
  debug: boolean
): string {
  const { entry, isFresh } = readCacheSyncWithMtime('subscriptionUsage', cacheDir, ttlSeconds);
  const prefix = formatSubscriptionUsagePrefix('five_hours', options);

  // Happy path: fresh valid cache with both windows
  if (entry !== null && isFresh) {
    const record = entry as {
      fiveHours?: { utilizationPercent?: unknown; resetsAt?: unknown };
      sevenDays?: { utilizationPercent?: unknown; resetsAt?: unknown };
    };

    const fiveHoursData = extractWindowData(record.fiveHours, 'five_hours');
    const sevenDaysData = extractWindowData(record.sevenDays, 'seven_days');

    const result = formatSubscriptionUsageAllSegment(fiveHoursData, sevenDaysData, options);
    if (result !== '') {
      return result;
    }
  }

  // Error state: recent fetch failed (within TTL)
  if (isRecentFetchError(entry, ttlSeconds)) {
    return `${prefix}${formatFetchErrorMessage(entry, debug)}`;
  }

  // Loading state: no cache or stale
  return `${prefix}Loading...`;
}

/**
 * Ensures the output is a single visible line (never empty/whitespace).
 *
 * - Extracts first line only (discards any newlines)
 * - Returns FALLBACK_OUTPUT if result is empty/whitespace
 *
 * Guarantees: returned string is never empty and never whitespace-only.
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
 * This is the main entry point for statusline generation.
 *
 * Guarantees (NEVER-SILENT):
 * - NEVER throws (catches all errors internally)
 * - ALWAYS returns a non-empty, visible single line
 * - Returns FALLBACK_OUTPUT on any error or missing input
 *
 * Behavior:
 * - Composes segments in specified order
 * - Reads subscription usage from cache (when segment enabled)
 * - Joins segments with " | " separator
 * - Ensures output is exactly one visible line
 *
 * @param input - Parsed input from Claude Code, or null if parsing failed
 * @param cacheDir - Cache directory (defaults to ~/.cache/ccusage-statusline)
 * @param segments - Segment order (defaults to DEFAULT_SEGMENT_ORDER)
 * @param renderOptions - Render options for emojis and bars (defaults to DEFAULT_RENDER_OPTIONS)
 * @returns A non-empty, single-line string
 */
export function generateStatusline(
  input: ClaudeCodeInput | null,
  cacheDir: string = DEFAULT_CACHE_DIR,
  segments?: readonly SegmentId[],
  renderOptions?: RenderOptions,
  debug = false
): string {
  try {
    if (input === null) {
      return FALLBACK_OUTPUT;
    }

    const segmentOrder = segments ?? DEFAULT_SEGMENT_ORDER;
    const options = renderOptions ?? DEFAULT_RENDER_OPTIONS;

    const composedSegments = composeSegments(input, cacheDir, segmentOrder, options, debug);

    if (composedSegments.length === 0) {
      return FALLBACK_OUTPUT;
    }

    const output = composedSegments.join(' | ');

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
