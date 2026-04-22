/**
 * Statusline generation with legacy format parity.
 *
 * Output format:
 * 🤖 <Model> | 💰 $<session> | 🧠 <used>k/<limit>k [████░░░░] <pct>% | ⌛️ <pct>% [████░░░░] (~h:mmam/pm)
*/

import type { ClaudeCodeInput } from '../types/claude-code.js';
import type { CacheEntry } from '../types/cache.js';
import { CACHE_FILE_NAMES, DEFAULT_CACHE_DIR, DEFAULT_CACHE_TTL_SECONDS } from '../types/cache.js';
import type { PluginConfig } from '../types/plugin.js';
import {
  extractModelDisplayName,
  extractSessionCost,
  extractTokenUsage,
} from './parser.js';
import {
  formatModelSegment,
  formatCostSegment,
  formatContextSegment,
  DEFAULT_RENDER_OPTIONS,
  type CostSegmentData,
} from './formatter.js';
import {
  buildSubscriptionUsageSegment,
  buildSubscriptionUsageAllSegment,
} from './subscription-usage.js';
import { readCacheSyncWithMtime, isLockFileFresh } from './cache-reader.js';
import {
  getContextLowThreshold,
  getContextMediumThreshold,
  getSegmentsConfig,
  getEmojisEnabled,
  getBarsEnabled,
} from '../config/env.js';
import type { RenderOptions } from './formatter.js';
import {
  isPluginSegmentId,
  parsePluginSegmentId,
  buildPluginSegment,
} from './plugin-segment.js';
import { shouldRefreshPlugin } from './plugin-cache.js';

/**
 * Canonical segment identifiers for built-in segments.
 */
export type BuiltinSegmentId = 'model' | 'cost_session' | 'context' | 'subscription_usage' | 'subscription_usage_all' | 'br';

/**
 * Segment identifier - either a built-in segment or a plugin segment (:xxx).
 */
export type SegmentId = BuiltinSegmentId | `:${string}` | (string & {});

/**
 * External segment registration config.
 */
export interface ExternalSegmentConfig {
  readonly builder: (
    input: ClaudeCodeInput,
    cacheDir: string,
    options: RenderOptions,
    debug?: boolean
  ) => string;
  readonly aliases?: readonly string[];
  readonly cacheTargets?: readonly string[];
  readonly cacheTtlSeconds?: number;
  readonly neverStandalone?: boolean;
}

const externalSegmentRegistry = new Map<string, ExternalSegmentConfig>();

/**
 * Registers an external segment.
 */
export function registerExternalSegment(id: string, config: ExternalSegmentConfig): void {
  const trimmed = id.trim();
  if (trimmed === '') {
    return;
  }
  externalSegmentRegistry.set(trimmed, config);
}

/**
 * Clears all external segment registrations.
 * Intended for tests and controlled re-initialization.
 */
export function clearExternalSegments(): void {
  externalSegmentRegistry.clear();
}

/**
 * @internal
 * Returns external segment config for tests/internal checks.
 */
export function getExternalSegmentConfig(id: string): ExternalSegmentConfig | undefined {
  return externalSegmentRegistry.get(id);
}

/**
 * Default segment order (matches original hardcoded behavior).
 */
export const DEFAULT_SEGMENT_ORDER: readonly SegmentId[] = [
  'model',
  'cost_session',
  'subscription_usage',
  'context',
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
  br: 'br',

  // Cost aliases
  cost: 'cost_session',
  cost_usd: 'cost_session',
  cost_sess: 'cost_session',
  sess: 'cost_session',

  // Context aliases
  ctx: 'context',

  // Subscription usage aliases
  subscription_usage: 'subscription_usage',
  usage: 'subscription_usage',
  subscription: 'subscription_usage',
  sub: 'subscription_usage',
  sub_usage: 'subscription_usage',
  subscription_usage_all: 'subscription_usage_all',
  sub_all: 'subscription_usage_all',
  usage_all: 'subscription_usage_all',
};

/**
 * Normalizes a segment identifier to its canonical form.
 *
 * Example: "ctx" → "context", "sub" → "subscription_usage", ":git" → ":git"
 *
 * @param id - User-provided segment identifier
 * @returns Canonical SegmentId or null if unknown/empty
 */
export function normalizeSegmentId(id: string): SegmentId | null {
  const trimmed = id.trim();
  if (trimmed === '') {
    return null;
  }

  // Handle plugin segments (:xxx)
  if (isPluginSegmentId(trimmed)) {
    const pluginId = parsePluginSegmentId(trimmed);
    if (pluginId !== null && pluginId !== '') {
      return trimmed as SegmentId;
    }
    return null;
  }

  // Handle built-in segments
  const normalized = trimmed.toLowerCase();
  const builtin = SEGMENT_ALIASES[normalized];
  if (builtin !== undefined) {
    return builtin;
  }

  for (const [externalId, config] of externalSegmentRegistry.entries()) {
    const idMatches = externalId.toLowerCase() === normalized;
    const aliasMatches = (config.aliases ?? []).some(alias => alias.toLowerCase() === normalized);

    if (idMatches || aliasMatches) {
      return externalId as SegmentId;
    }
  }

  return null;
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
    if (canonical === null) continue;
    // br is a structural marker and may appear multiple times — skip deduplication
    if (canonical === 'br') {
      result.push(canonical);
      continue;
    }
    if (!seen.has(canonical)) {
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
 * Mapping from built-in segment identifiers to required cache targets.
 */
const SEGMENT_CACHE_TARGETS: Record<BuiltinSegmentId, readonly string[]> = {
  model: [],
  cost_session: [],
  context: [],
  subscription_usage: [],
  subscription_usage_all: [],
  br: [],
};

/**
 * Gets the list of cache targets required for the given segments.
 *
 * Note: Plugin segments have their own cache system and are not included here.
 *
 * @param segments - Array of segment identifiers
 * @returns Array of cache target identifiers (deduplicated)
 */
export function getCacheTargetsForSegments(segments: readonly SegmentId[]): string[] {
  const allTargets = segments.flatMap(seg => {
    // Plugin segments have their own cache system
    if (isPluginSegmentId(seg)) {
      return [];
    }

    const external = externalSegmentRegistry.get(seg);
    if (external !== undefined) {
      return external.cacheTargets ?? [];
    }

    const targets = (SEGMENT_CACHE_TARGETS as Partial<Record<string, readonly string[]>>)[seg];
    return targets ?? [];
  });
  return [...new Set(allTargets)];
}

/**
 * Options for background update check.
 */
export interface BgUpdateCheckOptions {
  nowMs?: number;
  cooldownSeconds?: number;
  plugins?: readonly PluginConfig[];
  projectDir?: string;
}

/**
 * Checks if a cache entry is within the cooldown period since last attempt.
 *
 * @param entry - Cache entry (may be null)
 * @param nowMs - Current time in milliseconds
 * @param cooldownMs - Cooldown period in milliseconds
 * @returns true if still within cooldown (too soon to retry)
 */
function isWithinCooldown(entry: CacheEntry | null, nowMs: number, cooldownMs: number): boolean {
  if (entry === null) return false;

  if (typeof entry.lastAttemptAt !== 'string') return false;

  const lastAttemptMs = Date.parse(entry.lastAttemptAt);
  if (!Number.isFinite(lastAttemptMs)) return false;

  return nowMs - lastAttemptMs < cooldownMs;
}

/**
 * Determines whether a background cache update should be requested.
 *
 * Returns true when ALL conditions are met:
 * - At least one segment requires a cache target OR plugin cache is stale
 * - Update lock is NOT held (no concurrent update in progress)
 * - At least one cache target OR plugin needs refresh due to:
 *   - Missing cache file
 *   - Expired cache (beyond TTL)
 *   - Invalid/corrupt cache payload
 * - NOT within cooldown period since last attempt (prevents spawn storms)
 *
 * @param cacheDir - Cache directory path
 * @param segments - Array of segment identifiers
 * @param options - Optional check options (nowMs, cooldownSeconds default: 30, plugins, projectDir)
 * @returns true if background update should be requested
 */
export function shouldRequestBgCacheUpdate(
  cacheDir: string,
  segments: readonly SegmentId[],
  options?: BgUpdateCheckOptions
): boolean {
  const targets = getCacheTargetsForSegments(segments);
  const projectDir = options?.projectDir;

  // Only consider plugins actually referenced in segments (e.g. `:pluginId`)
  const allPlugins = options?.plugins ?? [];
  const referencedPluginIds = new Set(
    segments
      .filter(isPluginSegmentId)
      .map(s => parsePluginSegmentId(s))
      .filter((id): id is string => id !== null)
  );
  const plugins = allPlugins.filter(p => referencedPluginIds.has(p.id));

  if (targets.length === 0 && plugins.length === 0) return false;

  if (isLockFileFresh(cacheDir)) return false;

  const nowMs = options?.nowMs ?? Date.now();
  const cooldownMs = (options?.cooldownSeconds ?? 30) * 1000;

  const targetNeedsUpdate = targets.some(target => {
    if (CACHE_FILE_NAMES[target] === undefined) {
      return false;
    }

    let ttlSeconds = DEFAULT_CACHE_TTL_SECONDS;
    for (const [, config] of externalSegmentRegistry.entries()) {
      const hasTarget = config.cacheTargets?.includes(target) === true;
      if (hasTarget && config.cacheTtlSeconds !== undefined) {
        ttlSeconds = config.cacheTtlSeconds;
        break;
      }
    }

    const { entry, isFresh } = readCacheSyncWithMtime(target, cacheDir, ttlSeconds);

    // Skip this target if within cooldown (prevents spawn storms)
    if (isWithinCooldown(entry, nowMs, cooldownMs)) {
      return false; // Not ready for update; try other targets
    }

    if (entry === null || !isFresh) {
      return true;
    }

    const lastError = entry.lastError;
    return typeof lastError === 'string' && lastError.trim() !== '';
  });

  if (targetNeedsUpdate) return true;

  // Check plugin cache staleness
  return plugins.some(plugin => {
    const workingDir = plugin.workingDir ?? projectDir;
    return shouldRefreshPlugin(plugin, cacheDir, workingDir);
  });
}

/**
 * Visible fallback output when no meaningful statusline can be generated.
 * MUST be non-empty to satisfy AGENTS.md "NEVER silent" requirement.
 */
export const FALLBACK_OUTPUT = '🤖 ? | ⏳ Loading...';


/**
 * Extracts cost data from input for cost segment rendering.
 *
 * Currently only extracts session cost; extensible for future cost types.
 */
function buildCostSegmentData(input: ClaudeCodeInput): CostSegmentData {
  const sessionCost = extractSessionCost(input);
  if (sessionCost === undefined) return {};

  return { sessionCost };
}

/**
 * Segment builder function type.
 * Returns the segment string, or empty string if the segment should be omitted.
 */
type SegmentBuilder = (input: ClaudeCodeInput, cacheDir: string, options: RenderOptions) => string;

/**
 * Creates the segment builder registry for built-in segments.
 * Each builder returns an empty string if the segment should be omitted.
 */
function createSegmentBuilders(): Record<BuiltinSegmentId, SegmentBuilder> {
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
    subscription_usage: (input, _cacheDir, options): string =>
      buildSubscriptionUsageSegment(input, options),
    subscription_usage_all: (input, _cacheDir, options): string =>
      buildSubscriptionUsageAllSegment(input, options),
    br: (): string => '',
  };
}

/**
 * Plugin configuration map keyed by plugin ID.
 */
export type PluginConfigMap = ReadonlyMap<string, PluginConfig>;

/**
 * Composes segments in the specified order, filtering empty results.
 *
 * @param input - Parsed input
 * @param cacheDir - Cache directory
 * @param segmentOrder - Order of segments to render
 * @param renderOptions - Render options for emojis and bars
 * @param pluginConfigs - Optional plugin configuration map
 * @returns Array of non-empty segment strings or line-break markers
 */
type SegmentToken = string | { readonly kind: 'br' };

function composeSegments(
  input: ClaudeCodeInput,
  cacheDir: string,
  segmentOrder: readonly SegmentId[],
  renderOptions: RenderOptions,
  debug: boolean,
  pluginConfigs?: PluginConfigMap,
  projectDir?: string
): SegmentToken[] {
  const builders = createSegmentBuilders();
  const segments: SegmentToken[] = [];
  // Tracks how many visible string segments have been emitted so far.
  // Used to enforce neverStandalone: segments that must follow other content.
  let visibleSegmentCount = 0;

  for (const segmentId of segmentOrder) {
    if (segmentId === 'br') {
      segments.push({ kind: 'br' });
      continue;
    }

    let rendered: string;

    if (isPluginSegmentId(segmentId)) {
      rendered = renderPluginSegment(segmentId, pluginConfigs, cacheDir, renderOptions, projectDir);
    } else {
      const externalConfig = externalSegmentRegistry.get(segmentId);
      rendered = renderBuiltinSegment(
        segmentId,
        visibleSegmentCount,
        input,
        cacheDir,
        renderOptions,
        debug,
        builders,
        externalConfig
      );
    }

    if (rendered !== '') {
      segments.push(rendered);
      visibleSegmentCount++;
    }
  }

  return segments;
}

function renderPluginSegment(
  segmentId: SegmentId,
  pluginConfigs: PluginConfigMap | undefined,
  cacheDir: string,
  renderOptions: RenderOptions,
  projectDir?: string
): string {
  if (pluginConfigs === undefined) return '';

  const pluginId = parsePluginSegmentId(segmentId);
  if (pluginId === null) return '';

  const pluginConfig = pluginConfigs.get(pluginId);
  if (pluginConfig === undefined) return '';

  return buildPluginSegment(pluginConfig, cacheDir, renderOptions, projectDir);
}

function renderBuiltinSegment(
  segmentId: SegmentId,
  existingSegmentCount: number,
  input: ClaudeCodeInput,
  cacheDir: string,
  renderOptions: RenderOptions,
  debug: boolean,
  builders: Record<BuiltinSegmentId, SegmentBuilder>,
  externalConfig?: ExternalSegmentConfig
): string {
  if (externalConfig !== undefined) {
    const isStandaloneDisallowed = externalConfig.neverStandalone === true && existingSegmentCount === 0;
    if (isStandaloneDisallowed) return '';

    return externalConfig.builder(input, cacheDir, renderOptions, debug);
  }

  const builder = (builders as Partial<Record<string, SegmentBuilder>>)[segmentId];
  if (builder === undefined) return '';

  return builder(input, cacheDir, renderOptions);
}

/**
 * Assembles SegmentTokens into a multi-line string.
 *
 * Rules:
 * - br markers are collapsed (consecutive/leading/trailing removed)
 * - Remaining strings within each line are joined with ' | '
 * - Lines are joined with '\n'
 * - Returns '' when no visible content remains
 */
function assembleOutput(tokens: SegmentToken[]): string {
  const lines: string[][] = [[]];

  for (const token of tokens) {
    if (typeof token === 'string') {
      // Take only the first line of each segment to prevent raw data newlines from leaking
      const sanitized = token.split('\n')[0] ?? '';
      const current = lines[lines.length - 1];
      if (current !== undefined && sanitized !== '') current.push(sanitized);
    } else {
      lines.push([]);
    }
  }

  const nonEmptyLines = lines
    .map(line => line.join(' | '))
    .filter(line => line.trim() !== '');

  return nonEmptyLines.join('\n');
}

/**
 * Ensures the output is never empty/whitespace-only.
 *
 * - Returns FALLBACK_OUTPUT if all lines are empty/whitespace
 * - Otherwise returns text as-is (preserves newlines from br segments)
 *
 * Guarantees: returned string is never empty and never whitespace-only.
 */
function ensureVisibleOutput(text: string): string {
  const hasVisible = text.split('\n').some(line => line.trim() !== '');
  return hasVisible ? text : FALLBACK_OUTPUT;
}

/**
 * Options for statusline generation.
 */
export interface GenerateStatuslineOptions {
  readonly cacheDir?: string;
  readonly segments?: readonly SegmentId[];
  readonly renderOptions?: RenderOptions;
  readonly debug?: boolean;
  readonly pluginConfigs?: PluginConfigMap;
}

/**
 * Generates a statusline string from Claude Code input.
 *
 * This is the main entry point for statusline generation.
 *
 * Guarantees (NEVER-SILENT):
 * - NEVER throws (catches all errors internally)
 * - ALWAYS returns a non-empty, visible output (one or more lines)
 * - Returns FALLBACK_OUTPUT on any error or missing input
 *
 * Behavior:
 * - Composes segments in specified order
 * - Reads subscription usage from cache (when segment enabled)
 * - Joins segments with " | " separator
 * - Ensures output has at least one visible line
 *
 * @param input - Parsed input from Claude Code, or null if parsing failed
 * @param cacheDir - Cache directory (defaults to ~/.cache/cc-statusline-custom)
 * @param segments - Segment order (defaults to DEFAULT_SEGMENT_ORDER)
 * @param renderOptions - Render options for emojis and bars (defaults to DEFAULT_RENDER_OPTIONS)
 * @param debug - Enable debug mode
 * @param pluginConfigs - Optional plugin configuration map
 * @returns A non-empty string (one or more lines, separated by \n)
 */
export function generateStatusline(
  input: ClaudeCodeInput | null,
  cacheDir: string = DEFAULT_CACHE_DIR,
  segments?: readonly SegmentId[],
  renderOptions?: RenderOptions,
  debug = false,
  pluginConfigs?: PluginConfigMap,
  projectDir?: string
): string {
  try {
    if (input === null) {
      return FALLBACK_OUTPUT;
    }

    const segmentOrder = segments ?? DEFAULT_SEGMENT_ORDER;
    const options = renderOptions ?? DEFAULT_RENDER_OPTIONS;

    const composedSegments = composeSegments(input, cacheDir, segmentOrder, options, debug, pluginConfigs, projectDir);

    const hasContent = composedSegments.some(t => typeof t === 'string');
    if (!hasContent) {
      return FALLBACK_OUTPUT;
    }

    const output = assembleOutput(composedSegments);

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
