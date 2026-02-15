/**
 * Metric formatters for statusline output.
 *
 * Each formatter returns an empty string on missing/invalid input.
 * The compose function filters empty segments at compose-time.
 */

import {
  formatCurrency,
  formatPercentage,
  formatTokens,
  formatTokensCompact,
  formatTokensExact,
  formatProgressBar,
} from '../utils/format.js';
import { colorByThreshold, dim } from '../utils/colors.js';
import type { TokenUsage } from './parser.js';

/**
 * Display rendering options for segments.
 */
export interface RenderOptions {
  readonly showEmojis: boolean;
  readonly showBars: boolean;
}

/**
 * Default render options (all features enabled).
 */
export const DEFAULT_RENDER_OPTIONS: RenderOptions = {
  showEmojis: true,
  showBars: true,
};

/**
 * Segment emoji prefixes.
 */
const EMOJI_MODEL = '🤖';
const EMOJI_COST = '💰';
const EMOJI_CONTEXT = '🧠';

/**
 * Model family patterns for extraction from display names or IDs.
 */
const MODEL_FAMILIES = ['Opus', 'Sonnet', 'Haiku'] as const;

/**
 * Extracts model family name from a display name or model ID.
 *
 * @param name - Model display name or ID
 * @returns Extracted family name or the original name trimmed
 */
function extractModelFamily(name: string): string {
  const trimmed = name.trim();
  if (trimmed === '') {
    return '';
  }

  // Check for model family names (case-insensitive)
  const lowerName = trimmed.toLowerCase();
  for (const family of MODEL_FAMILIES) {
    if (lowerName.includes(family.toLowerCase())) {
      return family;
    }
  }

  // Return original name if no family matched
  return trimmed;
}

/**
 * Formats the model indicator for statusline display.
 * (Kept for backward compatibility)
 *
 * @param displayName - Model display name or ID
 * @returns Formatted model indicator or empty string
 */
export function formatModelIndicator(displayName: string | undefined): string {
  if (displayName === undefined || displayName.trim() === '') {
    return '';
  }
  return extractModelFamily(displayName);
}

/**
 * Formats session cost for statusline display.
 * (Kept for backward compatibility)
 *
 * @param usd - Cost in USD
 * @returns Formatted cost string or empty string
 */
export function formatSessionCost(usd: number | undefined): string {
  if (usd === undefined) {
    return '';
  }
  return formatCurrency(usd);
}

/**
 * Formats context usage percentage for statusline display.
 * (Kept for backward compatibility)
 *
 * @param pct - Usage percentage (0-100)
 * @returns Formatted percentage or empty string
 */
export function formatContextUsage(pct: number | undefined): string {
  if (pct === undefined) {
    return '';
  }
  return formatPercentage(pct);
}

// ============================================================================
// NEW SEGMENT FORMATTERS (with emoji prefixes)
// ============================================================================

/**
 * Formats token count with lowercase 'k' suffix, always showing 1 decimal.
 * Output: "25.0k" or "1.5m"
 * Used for compact token display.
 *
 * @param count - Token count
 * @returns Formatted string with lowercase suffix, or empty string
 */
export function formatTokensLowercase(count: number | null): string {
  if (count === null) {
    return '';
  }
  // formatTokens already outputs lowercase with 1 decimal
  return formatTokens(count);
}

/**
 * Formats token count with lowercase 'k' suffix, stripping .0 for round numbers.
 * Output: "200k" or "2m"
 * Used for compact token display.
 *
 * @param count - Token count
 * @returns Formatted string with lowercase suffix, or empty string
 */
export function formatTokensCompactLowercase(count: number | null): string {
  if (count === null) {
    return '';
  }
  // formatTokensCompact already outputs lowercase, strips .0
  return formatTokensCompact(count);
}

/**
 * Formats the model segment with optional emoji prefix.
 * Output: "🤖 Opus" or "Opus" (when emojis disabled)
 *
 * @param displayName - Model display name or ID
 * @param options - Render options
 * @returns Formatted model segment or empty string
 */
export function formatModelSegment(
  displayName: string | undefined,
  options: RenderOptions = DEFAULT_RENDER_OPTIONS
): string {
  if (displayName === undefined || displayName.trim() === '') {
    return '';
  }
  const family = extractModelFamily(displayName);
  if (family === '') {
    return '';
  }
  const prefix = options.showEmojis ? `${EMOJI_MODEL} ` : '';
  return `${prefix}${family}`;
}

/**
 * Cost segment input data.
 */
export interface CostSegmentData {
  readonly sessionCost?: number;
}

/**
 * Formats the unified cost segment with optional emoji prefix.
 * Output examples:
 * - "💰 $0.23" or "$0.23" (when emojis disabled)
 *
 * @param data - Cost segment data
 * @param options - Render options
 * @returns Formatted cost segment or empty string
 */
export function formatCostSegment(
  data: CostSegmentData,
  options: RenderOptions = DEFAULT_RENDER_OPTIONS
): string {
  if (data.sessionCost === undefined) {
    return '';
  }

  const formatted = formatCurrency(data.sessionCost);
  if (formatted === '') {
    return '';
  }

  const prefix = options.showEmojis ? `${EMOJI_COST} ` : '';
  return `${prefix}${formatted}`;
}

/**
 * Formats the context segment with emoji, tokens, bar, and percentage.
 * Output: "🧠 25,000 [████░░░░] (12%)"
 * (Context window limit is intentionally hidden.)
 *
 * If current tokens are null (current_usage was null), shows "0" for tokens.
 *
 * @param usage - Token usage data
 * @param lowThreshold - Green zone upper bound (exclusive)
 * @param mediumThreshold - Yellow zone upper bound (exclusive)
 * @param options - Render options for emojis and bars
 * @returns Formatted context segment or empty string
 */
export function formatContextSegment(
  usage: TokenUsage | undefined,
  lowThreshold = 50,
  mediumThreshold = 80,
  options: RenderOptions = DEFAULT_RENDER_OPTIONS
): string {
  // Prefix: emoji or text label
  const prefix = options.showEmojis ? `${EMOJI_CONTEXT} ` : 'ctx: ';

  // Generate placeholder for missing/invalid data
  const makePlaceholder = (): string => {
    const tokenText = dim(formatTokensExact(0));
    if (options.showBars) {
      const bar = formatProgressBar(0);
      // Use neutral/dim styling for placeholder cases
      return `${prefix}${tokenText} ${dim(bar)} ${dim('(0%)')}`;
    } else {
      return `${prefix}${tokenText} ${dim('(0%)')}`;
    }
  };

  if (usage === undefined) {
    return makePlaceholder();
  }

  const { current, percentage } = usage;

  // If no percentage or invalid, show placeholder
  if (percentage === null || !Number.isFinite(percentage)) {
    return makePlaceholder();
  }

  // Format tokens (use 0 if current is null)
  // Current uses exact integer display with thousands separators.
  const currentFormatted = formatTokensExact(current ?? 0);

  // Progress bar (conditional)
  const bar = options.showBars ? formatProgressBar(percentage) : '';

  // Percentage text (wrapped in parentheses)
  const pctText = `(${String(percentage)}%)`;

  // Apply threshold-based coloring to bar and percentage
  const coloredBar = bar !== '' ? colorByThreshold(bar, percentage, lowThreshold, mediumThreshold) : '';
  const coloredPct = colorByThreshold(pctText, percentage, lowThreshold, mediumThreshold);

  // Build the context segment with conditional spacing
  const parts: string[] = [];

  if (currentFormatted !== '') {
    parts.push(currentFormatted);
  }

  if (coloredBar !== '') {
    parts.push(coloredBar);
  }

  parts.push(coloredPct);

  return `${prefix}${parts.join(' ')}`;
}
