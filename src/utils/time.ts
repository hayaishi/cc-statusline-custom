/**
 * Time formatting utilities.
 *
 * Functions are deterministic and avoid locale-specific formatting.
 */

/**
 * Short month names in English.
 */
const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

/**
 * Formats an ISO8601 timestamp into a local "~h:mmam/pm" string.
 * When minutes are 00, outputs "~hpm/am" (minutes omitted).
 * For seven_days window, also includes date in format "~h:mmam/pm, Mon D".
 *
 * @param iso - ISO8601 timestamp
 * @param windowType - Optional window type ('five_hours' or 'seven_days')
 * @returns Formatted time string like "~3:45pm" or "~10:45pm, Feb 1", or empty string if invalid
 */
export function formatResetTime(
  iso: string,
  windowType?: 'five_hours' | 'seven_days'
): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) {
    return '';
  }

  const hours24 = date.getHours();
  const minutes = date.getMinutes();

  const ampm = hours24 < 12 ? 'am' : 'pm';
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  const minutesText = minutes === 0 ? '' : `:${String(minutes).padStart(2, '0')}`;

  const timeStr = `~${String(hours12)}${minutesText}${ampm}`;

  if (windowType === 'seven_days') {
    const day = date.getDate();
    const month = SHORT_MONTHS[date.getMonth()] ?? 'Jan'; // getMonth() returns 0-11, guaranteed for valid Date
    return `${timeStr}, ${month} ${String(day)}`;
  }

  return timeStr;
}

/**
 * Normalizes subscription reset timestamps.
 * If minutes are 59, rounds up by one minute to avoid 59-minute offsets.
 */
export function normalizeSubscriptionResetTime(iso: string): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) {
    return iso;
  }

  if (date.getMinutes() !== 59) {
    return iso;
  }

  const normalized = new Date(date.getTime() + 60_000);
  return normalized.toISOString();
}
