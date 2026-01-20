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
  formatDuration,
  formatProgressBar,
} from '../utils/format.js';
import { colorByThreshold } from '../utils/colors.js';
import type { TokenUsage } from './parser.js';

/**
 * Segment emoji prefixes.
 */
const EMOJI_MODEL = '🤖';
const EMOJI_COST = '💰';
const EMOJI_BURN = '🔥';
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

/**
 * Formats burn rate for statusline display.
 * (Kept for backward compatibility)
 *
 * @param ratePerHour - Cost per hour in USD
 * @returns Formatted rate string or empty string
 */
export function formatBurnRate(ratePerHour: number | undefined): string {
  if (ratePerHour === undefined) {
    return '';
  }
  const formatted = formatCurrency(ratePerHour);
  if (formatted === '') {
    return '';
  }
  return formatted + '/hr';
}

/**
 * Formats daily total for statusline display.
 * (Kept for backward compatibility)
 *
 * @param usd - Daily total in USD
 * @returns Formatted daily total or empty string
 */
export function formatDailyTotal(usd: number | undefined): string {
  if (usd === undefined) {
    return '';
  }
  const formatted = formatCurrency(usd);
  if (formatted === '') {
    return '';
  }
  return formatted + ' today';
}

// ============================================================================
// NEW SEGMENT FORMATTERS (with emoji prefixes)
// ============================================================================

/**
 * Formats token count with lowercase 'k' suffix, always showing 1 decimal.
 * Output: "25.0k" or "1.5m"
 * Used for current token count (numerator).
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
 * Used for context limit (denominator).
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
 * Formats the model segment with emoji prefix.
 * Output: "🤖 Opus" or "🤖 ?" for empty/unknown
 *
 * @param displayName - Model display name or ID
 * @returns Formatted model segment or empty string
 */
export function formatModelSegment(displayName: string | undefined): string {
  if (displayName === undefined || displayName.trim() === '') {
    return '';
  }
  const family = extractModelFamily(displayName);
  if (family === '') {
    return '';
  }
  return `${EMOJI_MODEL} ${family}`;
}

/**
 * Cost segment input data.
 */
export interface CostSegmentData {
  readonly sessionCost?: number;
  readonly dailyTotal?: number;
  readonly blockCost?: number;
  readonly blockTimeRemaining?: number; // seconds
}

/**
 * Formats the unified cost segment with emoji prefix.
 * Output examples:
 * - Full: "💰 $0.23 sess / $1.23 today / $0.45 (2h 45m left)"
 * - No block: "💰 $0.23 sess / $1.23 today"
 * - Minimal: "💰 $0.23 sess"
 *
 * @param data - Cost segment data
 * @returns Formatted cost segment or empty string
 */
export function formatCostSegment(data: CostSegmentData): string {
  const parts: string[] = [];

  // Session cost (always first if available)
  if (data.sessionCost !== undefined) {
    const formatted = formatCurrency(data.sessionCost);
    if (formatted !== '') {
      parts.push(`${formatted} sess`);
    }
  }

  // Daily total
  if (data.dailyTotal !== undefined) {
    const formatted = formatCurrency(data.dailyTotal);
    if (formatted !== '') {
      parts.push(`${formatted} today`);
    }
  }

  // Block info with time remaining
  if (data.blockCost !== undefined) {
    const costFormatted = formatCurrency(data.blockCost);
    if (costFormatted !== '') {
      if (data.blockTimeRemaining !== undefined && data.blockTimeRemaining > 0) {
        const duration = formatDuration(data.blockTimeRemaining);
        if (duration !== '') {
          parts.push(`${costFormatted} (${duration} left)`);
        } else {
          parts.push(costFormatted);
        }
      } else {
        parts.push(costFormatted);
      }
    }
  }

  if (parts.length === 0) {
    return '';
  }

  return `${EMOJI_COST} ${parts.join(' / ')}`;
}

/**
 * Formats the burn rate segment with emoji prefix.
 * Output: "🔥 $0.12/hr"
 *
 * @param ratePerHour - Cost per hour in USD
 * @returns Formatted burn rate segment or empty string
 */
export function formatBurnRateSegment(ratePerHour: number | undefined): string {
  if (ratePerHour === undefined) {
    return '';
  }
  const formatted = formatCurrency(ratePerHour);
  if (formatted === '') {
    return '';
  }
  return `${EMOJI_BURN} ${formatted}/hr`;
}

/**
 * Formats the context segment with emoji, tokens, bar, and percentage.
 * Output: "🧠 25.0k/200k [████░░░░] 12%"
 *
 * If current tokens are null (current_usage was null), shows "0.0k" for tokens.
 *
 * @param usage - Token usage data
 * @param lowThreshold - Green zone upper bound (exclusive)
 * @param mediumThreshold - Yellow zone upper bound (exclusive)
 * @returns Formatted context segment or empty string
 */
export function formatContextSegment(
  usage: TokenUsage | undefined,
  lowThreshold: number = 50,
  mediumThreshold: number = 80
): string {
  if (usage === undefined) {
    return '';
  }

  const { current, limit, percentage } = usage;

  // If no percentage, we can't render anything meaningful
  if (percentage === null) {
    return '';
  }

  // Format tokens (use 0 if current is null)
  // Current uses always-decimal format, limit uses compact format
  const currentFormatted = formatTokensLowercase(current ?? 0);
  const limitFormatted = limit !== null ? formatTokensCompactLowercase(limit) : '';

  // Progress bar
  const bar = formatProgressBar(percentage);

  // Percentage text
  const pctText = `${percentage}%`;

  // Apply threshold-based coloring to bar and percentage
  const coloredBar = colorByThreshold(bar, percentage, lowThreshold, mediumThreshold);
  const coloredPct = colorByThreshold(pctText, percentage, lowThreshold, mediumThreshold);

  // Build the context segment
  if (limitFormatted !== '' && currentFormatted !== '') {
    return `${EMOJI_CONTEXT} ${currentFormatted}/${limitFormatted} ${coloredBar} ${coloredPct}`;
  } else if (currentFormatted !== '') {
    return `${EMOJI_CONTEXT} ${currentFormatted} ${coloredBar} ${coloredPct}`;
  } else {
    return `${EMOJI_CONTEXT} ${coloredBar} ${coloredPct}`;
  }
}
