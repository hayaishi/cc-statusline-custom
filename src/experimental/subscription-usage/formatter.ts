import { formatCurrency, formatProgressBar } from '../../utils/format.js';
import type { RenderOptions } from '../../core/formatter.js';

const DEFAULT_RENDER_OPTIONS: RenderOptions = {
  showEmojis: true,
  showBars: true,
};

type SubscriptionWindowType = 'five_hours' | 'seven_days';

export const EMOJI_SUB_5HR = '⌛️';
export const EMOJI_SUB_7DAY = '🌙';
export const EMOJI_EXTRA = '✨';

export interface WindowData {
  readonly percent: number;
  readonly reset: string;
}

export function formatSubscriptionUsagePrefix(
  windowType: SubscriptionWindowType,
  options: RenderOptions = DEFAULT_RENDER_OPTIONS
): string {
  if (windowType === 'seven_days') {
    return options.showEmojis ? `${EMOJI_SUB_7DAY} ` : '7d: ';
  }
  return options.showEmojis ? `${EMOJI_SUB_5HR} ` : '5h: ';
}

export const NORMAL_SUB_BAR_WIDTH = 8;
export const SUB_ALL_BAR_WIDTH = Math.max(1, Math.floor(NORMAL_SUB_BAR_WIDTH / 2));

export interface ExtraUsageData {
  readonly usedUsd: number;
  readonly utilizationPercent: number;
}

export function formatExtraUsageWindow(
  data: ExtraUsageData | null,
  options: RenderOptions = DEFAULT_RENDER_OPTIONS,
  barWidth: number = SUB_ALL_BAR_WIDTH
): string {
  if (data === null) {
    return '';
  }

  const prefix = options.showEmojis ? `${EMOJI_EXTRA} ` : 'extra: ';
  const currency = formatCurrency(data.usedUsd);
  if (currency === '') {
    return '';
  }

  const pctText = `(${data.utilizationPercent.toFixed(1)}%)`;

  if (options.showBars) {
    const bar = formatProgressBar(data.utilizationPercent, barWidth);
    return `${prefix}${currency} ${bar} ${pctText}`;
  }
  return `${prefix}${currency} ${pctText}`;
}

export function formatSubscriptionUsageAllSegment(
  fiveHours: WindowData | null,
  sevenDays: WindowData | null,
  options: RenderOptions = DEFAULT_RENDER_OPTIONS,
  formatOptions: {
    readonly primaryWindowType?: SubscriptionWindowType;
    readonly barWidth?: number;
  } = {}
): string {
  const primaryWindowType = formatOptions.primaryWindowType ?? 'five_hours';
  const requestedBarWidth = formatOptions.barWidth;
  const barWidth =
    typeof requestedBarWidth === 'number' &&
    Number.isFinite(requestedBarWidth) &&
    requestedBarWidth > 0
      ? requestedBarWidth
      : SUB_ALL_BAR_WIDTH;

  const formatWindow = (
    data: WindowData,
    windowType: SubscriptionWindowType
  ): string => {
    const prefix = formatSubscriptionUsagePrefix(windowType, options);
    if (options.showBars) {
      const bar = formatProgressBar(data.percent, barWidth);
      return `${prefix}${String(data.percent)}% ${bar} (${data.reset})`;
    }
    return `${prefix}${String(data.percent)}% (${data.reset})`;
  };

  const isValidWindow = (data: WindowData | null): data is WindowData =>
    data !== null && Number.isFinite(data.percent) && data.reset.trim() !== '';

  if (!isValidWindow(fiveHours) && !isValidWindow(sevenDays)) {
    return '';
  }

  if (isValidWindow(fiveHours) && !isValidWindow(sevenDays)) {
    return formatWindow(fiveHours, primaryWindowType);
  }

  if (!isValidWindow(fiveHours) && isValidWindow(sevenDays)) {
    return formatWindow(sevenDays, 'seven_days');
  }

  if (isValidWindow(fiveHours) && isValidWindow(sevenDays)) {
    const fiveHoursStr = formatWindow(fiveHours, 'five_hours');
    const sevenDaysStr = formatWindow(sevenDays, 'seven_days');
    return `${fiveHoursStr} ${sevenDaysStr}`;
  }

  return '';
}
