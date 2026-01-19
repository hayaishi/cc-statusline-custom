/**
 * Metric formatters for statusline output.
 *
 * Each formatter returns an empty string on missing/invalid input.
 * The compose function filters empty segments at compose-time.
 */

import { formatCurrency, formatPercentage } from '../utils/format.js';

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
