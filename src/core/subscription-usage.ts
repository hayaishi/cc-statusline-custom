import { formatProgressBar } from '../utils/format.js';
import { formatResetTime, normalizeSubscriptionResetTime } from '../utils/time.js';
import { extractRateLimitWindow } from './parser.js';
import type { RenderOptions } from './formatter.js';
import type { ClaudeCodeInput } from '../types/claude-code.js';

export const EMOJI_SUB_5HR = '⌛️';
export const EMOJI_SUB_7DAY = '🌙';

export const NORMAL_SUB_BAR_WIDTH = 8;
export const SUB_ALL_BAR_WIDTH = Math.max(1, Math.floor(NORMAL_SUB_BAR_WIDTH / 2));

type SubscriptionWindowType = 'five_hours' | 'seven_days';

export function formatSubscriptionUsagePrefix(
  windowType: SubscriptionWindowType,
  options: RenderOptions
): string {
  if (windowType === 'seven_days') {
    return options.showEmojis ? `${EMOJI_SUB_7DAY} ` : '7d: ';
  }
  return options.showEmojis ? `${EMOJI_SUB_5HR} ` : '5h: ';
}

interface WindowData {
  readonly percent: number;
  readonly reset: string;
}

function formatWindow(
  data: WindowData,
  windowType: SubscriptionWindowType,
  options: RenderOptions,
  barWidth: number
): string {
  const prefix = formatSubscriptionUsagePrefix(windowType, options);
  if (options.showBars) {
    const bar = formatProgressBar(data.percent, barWidth);
    return `${prefix}${String(data.percent)}% ${bar} (${data.reset})`;
  }
  return `${prefix}${String(data.percent)}% (${data.reset})`;
}

function epochSecToWindowData(
  resetsAtEpochSec: number,
  percent: number,
  windowType: SubscriptionWindowType
): WindowData | null {
  const iso = new Date(resetsAtEpochSec * 1000).toISOString();
  const normalized = normalizeSubscriptionResetTime(iso);
  const reset = formatResetTime(normalized, windowType);
  if (reset === '') {
    return null;
  }
  return { percent, reset };
}

export function buildSubscriptionUsageSegment(
  input: ClaudeCodeInput,
  options: RenderOptions
): string {
  const fiveHour = extractRateLimitWindow(input, 'five_hour');
  if (fiveHour === null) {
    return '';
  }

  const data = epochSecToWindowData(fiveHour.resetsAtEpochSec, fiveHour.percent, 'five_hours');
  if (data === null) {
    return '';
  }

  return formatWindow(data, 'five_hours', options, NORMAL_SUB_BAR_WIDTH);
}

export function buildSubscriptionUsageAllSegment(
  input: ClaudeCodeInput,
  options: RenderOptions
): string {
  const fiveHour = extractRateLimitWindow(input, 'five_hour');
  const sevenDay = extractRateLimitWindow(input, 'seven_day');

  const fiveData = fiveHour !== null
    ? epochSecToWindowData(fiveHour.resetsAtEpochSec, fiveHour.percent, 'five_hours')
    : null;
  const sevenData = sevenDay !== null
    ? epochSecToWindowData(sevenDay.resetsAtEpochSec, sevenDay.percent, 'seven_days')
    : null;

  if (fiveData === null && sevenData === null) {
    return '';
  }

  if (fiveData !== null && sevenData === null) {
    return formatWindow(fiveData, 'five_hours', options, SUB_ALL_BAR_WIDTH);
  }

  if (fiveData === null && sevenData !== null) {
    return formatWindow(sevenData, 'seven_days', options, SUB_ALL_BAR_WIDTH);
  }

  // Both present — TypeScript requires the explicit null check here for narrowing
  if (fiveData !== null && sevenData !== null) {
    const fiveStr = formatWindow(fiveData, 'five_hours', options, SUB_ALL_BAR_WIDTH);
    const sevenStr = formatWindow(sevenData, 'seven_days', options, SUB_ALL_BAR_WIDTH);
    return `${fiveStr} ${sevenStr}`;
  }

  return '';
}
