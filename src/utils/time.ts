/**
 * Time formatting utilities.
 *
 * Functions are deterministic and avoid locale-specific formatting.
 */

/**
 * Formats an ISO8601 timestamp into a local "~h:mmam/pm" string.
 *
 * @param iso - ISO8601 timestamp
 * @returns Formatted time string like "~3:45pm", or empty string if invalid
 */
export function formatResetTime(iso: string): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) {
    return '';
  }

  const hours24 = date.getHours();
  const minutes = date.getMinutes();

  const ampm = hours24 < 12 ? 'am' : 'pm';
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  const minutesText = String(minutes).padStart(2, '0');

  return `~${String(hours12)}:${minutesText}${ampm}`;
}
