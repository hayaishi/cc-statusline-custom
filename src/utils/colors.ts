/**
 * ANSI color utilities using picocolors.
 *
 * Provides threshold-based coloring for context usage display.
 * Colors are applied based on percentage thresholds:
 * - Green: below low threshold (good)
 * - Yellow: between low and medium thresholds (warning)
 * - Red: at or above medium threshold (critical)
 */

import pc from 'picocolors';

/**
 * Color function type from picocolors.
 */
type ColorFn = (text: string) => string;

/**
 * Gets the appropriate color function based on percentage and thresholds.
 *
 * @param pct - Percentage value (0-100)
 * @param lowThreshold - Upper bound for green zone (exclusive)
 * @param mediumThreshold - Upper bound for yellow zone (exclusive)
 * @returns Color function from picocolors
 */
export function getThresholdColor(
  pct: number,
  lowThreshold = 50,
  mediumThreshold = 80
): ColorFn {
  if (pct < lowThreshold) {
    return pc.green;
  }
  if (pct < mediumThreshold) {
    return pc.yellow;
  }
  return pc.red;
}

/**
 * Applies threshold-based coloring to text.
 *
 * @param text - Text to colorize
 * @param pct - Percentage value (0-100)
 * @param lowThreshold - Upper bound for green zone (exclusive)
 * @param mediumThreshold - Upper bound for yellow zone (exclusive)
 * @returns Colorized string with ANSI escape codes
 */
export function colorByThreshold(
  text: string,
  pct: number,
  lowThreshold = 50,
  mediumThreshold = 80
): string {
  const colorFn = getThresholdColor(pct, lowThreshold, mediumThreshold);
  return colorFn(text);
}

/**
 * Strips ANSI escape codes from a string.
 * Useful for testing and plain-text output.
 *
 * @param text - String potentially containing ANSI codes
 * @returns String with ANSI codes removed
 */
export function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1b\[[0-9;]*m/g, '');
}

/**
 * Dim style for placeholder/inactive text.
 */
export const dim = pc.dim;
