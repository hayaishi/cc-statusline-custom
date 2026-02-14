import { getSubscriptionCacheTtl } from '../../config/env.js';
import { readCacheSyncWithMtime } from '../../core/cache-reader.js';
import { formatProgressBar } from '../../utils/format.js';
import { formatResetTime, normalizeSubscriptionResetTime } from '../../utils/time.js';
import {
  formatExtraUsageWindow,
  formatSubscriptionUsageAllSegment,
  formatSubscriptionUsagePrefix,
  NORMAL_SUB_BAR_WIDTH,
  SUB_ALL_BAR_WIDTH,
} from './formatter.js';
import type { RenderOptions } from '../../core/formatter.js';
import type { CacheEntry } from '../../types/cache.js';
import type { WindowData } from './formatter.js';

export function getValidSubscriptionUsage(
  entry: CacheEntry
): { utilizationPercent: number; resetsAt: string } | null {
  const record = entry as {
    utilizationPercent?: unknown;
    resetsAt?: unknown;
  };

  const percentValue = record.utilizationPercent;
  if (typeof percentValue !== 'number' ||
      !Number.isInteger(percentValue) ||
      percentValue < 0 ||
      percentValue > 100) {
    return null;
  }

  if (typeof record.resetsAt !== 'string' ||
      !Number.isFinite(Date.parse(record.resetsAt))) {
    return null;
  }

  return { utilizationPercent: percentValue, resetsAt: record.resetsAt };
}

export function getLastAttemptAt(entry: CacheEntry): number | null {
  const record = entry as { lastAttemptAt?: unknown };
  if (typeof record.lastAttemptAt !== 'string') {
    return null;
  }

  const parsedMs = Date.parse(record.lastAttemptAt);
  if (!Number.isFinite(parsedMs)) {
    return null;
  }

  return parsedMs;
}

export function isRecentFetchError(entry: CacheEntry | null, ttlSeconds: number): boolean {
  if (entry === null) {
    return false;
  }

  const lastAttemptMs = getLastAttemptAt(entry);
  if (lastAttemptMs === null) {
    return false;
  }

  const ageSeconds = (Date.now() - lastAttemptMs) / 1000;
  return ageSeconds < ttlSeconds;
}

export const MAX_FETCH_ERROR_DETAIL_LENGTH = 32;

export function normalizeFetchErrorDetail(value: string): string {
  const singleLine = value.replace(/\s+/g, ' ').trim();
  if (singleLine.length <= MAX_FETCH_ERROR_DETAIL_LENGTH) {
    return singleLine;
  }
  const truncated = singleLine.slice(0, MAX_FETCH_ERROR_DETAIL_LENGTH - 3).trimEnd();
  return `${truncated}...`;
}

export function formatFetchErrorMessage(entry: CacheEntry | null, debug: boolean): string {
  const fallback = 'Fetch Error...';

  if (!debug || entry === null) {
    return fallback;
  }

  const record = entry as { lastError?: unknown };
  if (typeof record.lastError !== 'string') {
    return fallback;
  }

  const trimmed = record.lastError.trim();
  if (trimmed === '') {
    return fallback;
  }

  return `Fetch Error (${normalizeFetchErrorDetail(trimmed)})`;
}

export function buildSubscriptionUsageSegment(
  cacheDir: string,
  ttlSeconds: number,
  options: RenderOptions,
  debug: boolean
): string {
  const effectiveTtl = ttlSeconds > 0 ? ttlSeconds : getSubscriptionCacheTtl();
  const { entry, isFresh } = readCacheSyncWithMtime('subscriptionUsage', cacheDir, effectiveTtl);
  const entryWindow = entry !== null
    ? (entry as { window?: 'five_hours' | 'seven_days' }).window
    : undefined;
  const fallbackWindowType = entryWindow === 'seven_days' ? 'seven_days' : 'five_hours';
  const prefix = formatSubscriptionUsagePrefix(fallbackWindowType, options);

  if (entry !== null && isFresh) {
    const valid = getValidSubscriptionUsage(entry);
    if (valid !== null) {
      const windowType = entryWindow;
      const reset = formatResetTime(normalizeSubscriptionResetTime(valid.resetsAt), windowType);
      if (reset !== '') {
        const primaryWindowType = fallbackWindowType;
        const windowData = { percent: valid.utilizationPercent, reset };

        const extraData = extractExtraUsageData(entry);
        const shouldShowExtra = extraData !== null
          && extraData.isEnabled
          && extraData.usedUsd > 0
          && valid.utilizationPercent >= 100;

        if (shouldShowExtra) {
          const extraFormatted = formatExtraUsageWindow(
            { usedUsd: extraData.usedUsd, utilizationPercent: extraData.utilizationPercent },
            options,
            SUB_ALL_BAR_WIDTH
          );

          const windowPrefix = formatSubscriptionUsagePrefix(primaryWindowType, options);
          let windowFormatted: string;
          if (options.showBars) {
            const bar = formatProgressBar(windowData.percent, SUB_ALL_BAR_WIDTH);
            windowFormatted = `${windowPrefix}${String(windowData.percent)}% ${bar} (${windowData.reset})`;
          } else {
            windowFormatted = `${windowPrefix}${String(windowData.percent)}% (${windowData.reset})`;
          }

          return `${extraFormatted} ${windowFormatted}`;
        }

        return formatSubscriptionUsageAllSegment(
          windowData,
          null,
          options,
          { primaryWindowType, barWidth: NORMAL_SUB_BAR_WIDTH }
        );
      }
    }
  }

  if (isRecentFetchError(entry, effectiveTtl)) {
    return `${prefix}${formatFetchErrorMessage(entry, debug)}`;
  }

  return `${prefix}Loading...`;
}

export function extractWindowData(
  window: { utilizationPercent?: unknown; resetsAt?: unknown } | undefined,
  windowType: 'five_hours' | 'seven_days'
): WindowData | null {
  if (!window) {
    return null;
  }

  const { utilizationPercent, resetsAt } = window;

  if (typeof utilizationPercent !== 'number' ||
      !Number.isInteger(utilizationPercent) ||
      utilizationPercent < 0 ||
      utilizationPercent > 100) {
    return null;
  }

  if (typeof resetsAt !== 'string') {
    return null;
  }
  const reset = formatResetTime(normalizeSubscriptionResetTime(resetsAt), windowType);
  if (reset === '') {
    return null;
  }

  return { percent: utilizationPercent, reset };
}

export function extractExtraUsageData(
  entry: CacheEntry
): { usedUsd: number; utilizationPercent: number; isEnabled: boolean } | null {
  const record = entry as {
    extraUsage?: {
      isEnabled?: unknown;
      usedCredits?: unknown;
      utilizationPercent?: unknown;
    };
  };

  const extra = record.extraUsage;
  if (!extra ||
      typeof extra.isEnabled !== 'boolean' ||
      typeof extra.usedCredits !== 'number' ||
      typeof extra.utilizationPercent !== 'number') {
    return null;
  }

  return {
    usedUsd: extra.usedCredits / 100,
    utilizationPercent: extra.utilizationPercent,
    isEnabled: extra.isEnabled,
  };
}

export function buildSubscriptionUsageAllSegment(
  cacheDir: string,
  ttlSeconds: number,
  options: RenderOptions,
  debug: boolean
): string {
  const effectiveTtl = ttlSeconds > 0 ? ttlSeconds : getSubscriptionCacheTtl();
  const { entry, isFresh } = readCacheSyncWithMtime('subscriptionUsage', cacheDir, effectiveTtl);
  const prefix = formatSubscriptionUsagePrefix('five_hours', options);

  if (entry !== null && isFresh) {
    const record = entry as {
      fiveHours?: { utilizationPercent?: unknown; resetsAt?: unknown };
      sevenDays?: { utilizationPercent?: unknown; resetsAt?: unknown };
    };

    const fiveHoursData = extractWindowData(record.fiveHours, 'five_hours');
    const sevenDaysData = extractWindowData(record.sevenDays, 'seven_days');

    const extraData = extractExtraUsageData(entry);
    const shouldShowExtra = extraData !== null
      && extraData.isEnabled
      && extraData.usedUsd > 0;

    const fiveAt100 = fiveHoursData !== null && fiveHoursData.percent >= 100;
    const sevenAt100 = sevenDaysData !== null && sevenDaysData.percent >= 100;

    if (shouldShowExtra && (fiveAt100 || sevenAt100)) {
      const extraFormatted = formatExtraUsageWindow(
        { usedUsd: extraData.usedUsd, utilizationPercent: extraData.utilizationPercent },
        options,
        SUB_ALL_BAR_WIDTH
      );

      const formatWindow = (
        data: WindowData,
        windowType: 'five_hours' | 'seven_days'
      ): string => {
        const windowPrefix = formatSubscriptionUsagePrefix(windowType, options);
        if (options.showBars) {
          const bar = formatProgressBar(data.percent, SUB_ALL_BAR_WIDTH);
          return `${windowPrefix}${String(data.percent)}% ${bar} (${data.reset})`;
        }
        return `${windowPrefix}${String(data.percent)}% (${data.reset})`;
      };

      if (sevenAt100) {
        const sevenFormatted = formatWindow(sevenDaysData, 'seven_days');
        return `${extraFormatted} ${sevenFormatted}`;
      }
      if (fiveAt100) {
        const fiveFormatted = formatWindow(fiveHoursData, 'five_hours');
        return `${extraFormatted} ${fiveFormatted}`;
      }
    }

    const result = formatSubscriptionUsageAllSegment(fiveHoursData, sevenDaysData, options);
    if (result !== '') {
      return result;
    }
  }

  if (isRecentFetchError(entry, effectiveTtl)) {
    return `${prefix}${formatFetchErrorMessage(entry, debug)}`;
  }

  return `${prefix}Loading...`;
}
