/**
 * Number and currency formatting utilities.
 *
 * All functions handle edge cases gracefully and return empty string
 * for invalid inputs (NaN, Infinity, negative values where inappropriate).
 */

/**
 * Checks if a number is valid for formatting.
 */
function isValidNumber(value: number): boolean {
  return Number.isFinite(value);
}

/**
 * Formats a USD value as a currency string.
 *
 * @param usd - The value in USD
 * @returns Formatted string like "$0.23", or empty string for invalid input
 */
export function formatCurrency(usd: number): string {
  if (!isValidNumber(usd) || usd < 0) {
    return '';
  }
  return `$${usd.toFixed(2)}`;
}

/**
 * Formats a percentage value.
 *
 * @param pct - Percentage value (0-100)
 * @returns Formatted string like "42%", or empty string for invalid input
 */
export function formatPercentage(pct: number): string {
  if (!isValidNumber(pct)) {
    return '';
  }
  // Clamp to 0-100 range
  const clamped = Math.max(0, Math.min(100, pct));
  return '(' + String(Math.round(clamped)) + '%)';
}

/**
 * Formats a token count with k/m suffixes, always showing 1 decimal place.
 * Used for current token count (numerator).
 *
 * @param count - Token count
 * @returns Formatted string like "25.0k", or empty string for invalid input
 */
export function formatTokens(count: number): string {
  if (!isValidNumber(count) || count < 0) {
    return '';
  }

  if (count < 1000) {
    return String(Math.floor(count));
  }

  if (count < 1000000) {
    const thousands = count / 1000;
    const rounded = Math.round(thousands * 10) / 10;
    // Promote to m if rounded k-value >= 1000 (e.g., 999_999 -> 1.0m)
    if (rounded >= 1000) {
      const millions = rounded / 1000;
      const millionsRounded = Math.round(millions * 10) / 10;
      return `${millionsRounded.toFixed(1)}m`;
    }
    // Always show 1 decimal place for k values
    const formatted = rounded.toFixed(1);
    return `${formatted}k`;
  }

  const millions = count / 1000000;
  const rounded = Math.round(millions * 10) / 10;
  // Always show 1 decimal place for m values
  const formatted = rounded.toFixed(1);
  return `${formatted}m`;
}

/**
 * Formats a token count with k/m suffixes, stripping .0 for round numbers.
 * Used for context limit (denominator).
 *
 * @param count - Token count
 * @returns Formatted string like "200k", or empty string for invalid input
 */
export function formatTokensCompact(count: number): string {
  if (!isValidNumber(count) || count < 0) {
    return '';
  }

  if (count < 1000) {
    return String(Math.floor(count));
  }

  if (count < 1000000) {
    const thousands = count / 1000;
    const rounded = Math.round(thousands * 10) / 10;
    // Promote to m if rounded k-value >= 1000 (e.g., 999_999 -> 1m)
    if (rounded >= 1000) {
      const millions = rounded / 1000;
      const millionsRounded = Math.round(millions * 10) / 10;
      // Strip .0 for round numbers
      const formatted = millionsRounded % 1 === 0 ? String(millionsRounded) : millionsRounded.toFixed(1);
      return `${formatted}m`;
    }
    // Strip .0 for round numbers
    const formatted = rounded % 1 === 0 ? String(rounded) : rounded.toFixed(1);
    return `${formatted}k`;
  }

  const millions = count / 1000000;
  const rounded = Math.round(millions * 10) / 10;
  // Strip .0 for round numbers
  const formatted = rounded % 1 === 0 ? String(rounded) : rounded.toFixed(1);
  return `${formatted}m`;
}

/**
 * Formats a duration in seconds to hours and minutes.
 *
 * @param seconds - Duration in seconds
 * @returns Formatted string like "2h 45m", or empty string for invalid input
 */
export function formatDuration(seconds: number): string {
  if (!isValidNumber(seconds) || seconds < 0) {
    return '';
  }

  const totalMinutes = Math.floor(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) {
    return String(minutes) + 'm';
  }

  return String(hours) + 'h ' + String(minutes) + 'm';
}

/**
 * Progress bar characters.
 */
const PROGRESS_FILLED = '█';
const PROGRESS_EMPTY = '░';
const PROGRESS_BAR_WIDTH = 8;

/**
 * Generates a progress bar string.
 *
 * @param pct - Percentage value (0-100)
 * @param width - Total width in characters (default: 8)
 * @returns Progress bar string like "[████░░░░]", or empty string for invalid input
 */
export function formatProgressBar(pct: number, width: number = PROGRESS_BAR_WIDTH): string {
  if (!isValidNumber(pct)) {
    return '';
  }

  const clamped = Math.max(0, Math.min(100, pct));
  const filled = Math.round((clamped / 100) * width);
  const empty = width - filled;

  return '[' + PROGRESS_FILLED.repeat(filled) + PROGRESS_EMPTY.repeat(empty) + ']';
}
