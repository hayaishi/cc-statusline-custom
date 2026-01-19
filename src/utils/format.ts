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
  return String(Math.round(clamped)) + '%';
}

/**
 * Formats a token count with K/M suffixes.
 *
 * @param count - Token count
 * @returns Formatted string like "25K", or empty string for invalid input
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
    // Remove .0 suffix
    const formatted = rounded % 1 === 0 ? String(rounded) : rounded.toFixed(1);
    return `${formatted}K`;
  }

  const millions = count / 1000000;
  const rounded = Math.round(millions * 10) / 10;
  const formatted = rounded % 1 === 0 ? String(rounded) : rounded.toFixed(1);
  return `${formatted}M`;
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
