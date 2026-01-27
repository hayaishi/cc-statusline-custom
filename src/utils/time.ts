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
 * For seven_day window, also includes date in format "~h:mmam/pm, D Mon".
 *
 * @param iso - ISO8601 timestamp
 * @param windowType - Optional window type ('five_hour' or 'seven_day')
 * @returns Formatted time string like "~3:45pm" or "~10:45pm, 1 Feb", or empty string if invalid
 */
export function formatResetTime(
  iso: string,
  windowType?: 'five_hour' | 'seven_day'
): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) {
    return '';
  }

  const hours24 = date.getHours();
  const minutes = date.getMinutes();

  const ampm = hours24 < 12 ? 'am' : 'pm';
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  const minutesText = String(minutes).padStart(2, '0');

  const timeStr = `~${String(hours12)}:${minutesText}${ampm}`;

  if (windowType === 'seven_day') {
    const day = date.getDate();
    const month = SHORT_MONTHS[date.getMonth()] ?? 'Jan'; // getMonth() returns 0-11, guaranteed for valid Date
    return `${timeStr}, ${String(day)} ${month}`;
  }

  return timeStr;
}
