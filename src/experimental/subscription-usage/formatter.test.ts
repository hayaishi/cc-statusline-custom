import { describe, it, expect } from 'vitest';
import {
  formatSubscriptionUsageAllSegment,
  formatSubscriptionUsagePrefix,
  formatExtraUsageWindow,
  type WindowData,
} from './formatter.js';
import type { RenderOptions } from '../../core/formatter.js';

const DEFAULT_RENDER_OPTIONS: RenderOptions = {
  showEmojis: true,
  showBars: true,
};

describe('RenderOptions - no-emojis behavior', () => {
  describe('formatSubscriptionUsageAllSegment with options', () => {
    const singleWindow: WindowData = { percent: 55, reset: '~3:45pm' };

    it('includes emoji prefix by default', () => {
      const result = formatSubscriptionUsageAllSegment(
        singleWindow,
        null,
        DEFAULT_RENDER_OPTIONS,
        { barWidth: 8 }
      );
      expect(result).toBe('⌛️ 55% [████░░░░] (~3:45pm)');
    });

    it('uses 5h: label when showEmojis is false', () => {
      const result = formatSubscriptionUsageAllSegment(
        singleWindow,
        null,
        { showEmojis: false, showBars: true },
        { barWidth: 8 }
      );
      expect(result).toBe('5h: 55% [████░░░░] (~3:45pm)');
    });
  });
});

describe('formatSubscriptionUsagePrefix', () => {
  it('returns emoji prefix for five_hours', () => {
    expect(formatSubscriptionUsagePrefix('five_hours', DEFAULT_RENDER_OPTIONS)).toBe('⌛️ ');
  });

  it('returns label prefix for seven_days when emojis are disabled', () => {
    expect(formatSubscriptionUsagePrefix('seven_days', { showEmojis: false, showBars: true })).toBe('7d: ');
  });
});

describe('formatSubscriptionUsageAllSegment', () => {
  const fiveHoursData: WindowData = { percent: 55, reset: '~3:45pm' };
  const sevenDaysData: WindowData = { percent: 55, reset: '~10:45pm, Feb 1' };

  it('formats both windows with emojis and bars (default)', () => {
    const result = formatSubscriptionUsageAllSegment(fiveHoursData, sevenDaysData, DEFAULT_RENDER_OPTIONS);
    expect(result).toBe('⌛️ 55% [██░░] (~3:45pm) 🌙 55% [██░░] (~10:45pm, Feb 1)');
  });

  it('formats with no-emojis', () => {
    const result = formatSubscriptionUsageAllSegment(fiveHoursData, sevenDaysData, { showEmojis: false, showBars: true });
    expect(result).toBe('5h: 55% [██░░] (~3:45pm) 7d: 55% [██░░] (~10:45pm, Feb 1)');
  });

  it('formats with no-bars', () => {
    const result = formatSubscriptionUsageAllSegment(fiveHoursData, sevenDaysData, { showEmojis: true, showBars: false });
    expect(result).toBe('⌛️ 55% (~3:45pm) 🌙 55% (~10:45pm, Feb 1)');
  });

  it('formats with both flags disabled', () => {
    const result = formatSubscriptionUsageAllSegment(fiveHoursData, sevenDaysData, { showEmojis: false, showBars: false });
    expect(result).toBe('5h: 55% (~3:45pm) 7d: 55% (~10:45pm, Feb 1)');
  });

  it('uses half-width bars (4 chars instead of 8)', () => {
    const result = formatSubscriptionUsageAllSegment(
      { percent: 0, reset: '~12:00am' },
      { percent: 100, reset: '~11:59pm, Dec 31' },
      DEFAULT_RENDER_OPTIONS
    );
    expect(result).toBe('⌛️ 0% [░░░░] (~12:00am) 🌙 100% [████] (~11:59pm, Dec 31)');
  });

  it('formats only sevenDays when fiveHours is null', () => {
    const result = formatSubscriptionUsageAllSegment(null, sevenDaysData, DEFAULT_RENDER_OPTIONS);
    expect(result).toBe('🌙 55% [██░░] (~10:45pm, Feb 1)');
  });

  it('formats only sevenDays when fiveHours percent is not finite', () => {
    const result = formatSubscriptionUsageAllSegment({ percent: Number.NaN, reset: '~3:45pm' }, sevenDaysData, DEFAULT_RENDER_OPTIONS);
    expect(result).toBe('🌙 55% [██░░] (~10:45pm, Feb 1)');
  });

  it('formats only sevenDays when fiveHours reset is empty', () => {
    const result = formatSubscriptionUsageAllSegment({ percent: 55, reset: '' }, sevenDaysData, DEFAULT_RENDER_OPTIONS);
    expect(result).toBe('🌙 55% [██░░] (~10:45pm, Feb 1)');
  });

  it('formats only fiveHours when sevenDays is null', () => {
    const result = formatSubscriptionUsageAllSegment(fiveHoursData, null, DEFAULT_RENDER_OPTIONS);
    expect(result).toBe('⌛️ 55% [██░░] (~3:45pm)');
  });

  it('formats single window with seven_days label when configured', () => {
    const result = formatSubscriptionUsageAllSegment(
      sevenDaysData,
      null,
      DEFAULT_RENDER_OPTIONS,
      { primaryWindowType: 'seven_days', barWidth: 8 }
    );
    expect(result).toBe('🌙 55% [████░░░░] (~10:45pm, Feb 1)');
  });

  it('formats only fiveHours when sevenDays percent is not finite', () => {
    const result = formatSubscriptionUsageAllSegment(fiveHoursData, { percent: Number.POSITIVE_INFINITY, reset: '~10:45pm, Feb 1' }, DEFAULT_RENDER_OPTIONS);
    expect(result).toBe('⌛️ 55% [██░░] (~3:45pm)');
  });

  it('formats only fiveHours when sevenDays reset is empty', () => {
    const result = formatSubscriptionUsageAllSegment(fiveHoursData, { percent: 55, reset: '   ' }, DEFAULT_RENDER_OPTIONS);
    expect(result).toBe('⌛️ 55% [██░░] (~3:45pm)');
  });

  it('handles different percentages for each window', () => {
    const result = formatSubscriptionUsageAllSegment(
      { percent: 25, reset: '~3:45pm' },
      { percent: 75, reset: '~10:45pm, Feb 1' },
      DEFAULT_RENDER_OPTIONS
    );
    expect(result).toBe('⌛️ 25% [█░░░] (~3:45pm) 🌙 75% [███░] (~10:45pm, Feb 1)');
  });
});

describe('formatExtraUsageWindow', () => {
  it('formats extra usage with currency, bar, and utilization percentage', () => {
    const data = { usedUsd: 4.28, utilizationPercent: 8.56 };
    const result = formatExtraUsageWindow(data, DEFAULT_RENDER_OPTIONS, 4);
    expect(result).toBe('✨ $4.28 [░░░░] (8.6%)');
  });

  it('formats extra usage with emojis enabled', () => {
    const data = { usedUsd: 4.28, utilizationPercent: 8.56 };
    const result = formatExtraUsageWindow(data, { showEmojis: true, showBars: true }, 4);
    expect(result).toBe('✨ $4.28 [░░░░] (8.6%)');
  });

  it('formats extra usage without emojis', () => {
    const data = { usedUsd: 4.28, utilizationPercent: 8.56 };
    const result = formatExtraUsageWindow(data, { showEmojis: false, showBars: true }, 4);
    expect(result).toBe('extra: $4.28 [░░░░] (8.6%)');
  });

  it('formats extra usage without bars', () => {
    const data = { usedUsd: 4.28, utilizationPercent: 8.56 };
    const result = formatExtraUsageWindow(data, { showEmojis: true, showBars: false }, 4);
    expect(result).toBe('✨ $4.28 (8.6%)');
  });

  it('formats extra usage with no emojis and no bars', () => {
    const data = { usedUsd: 4.28, utilizationPercent: 8.56 };
    const result = formatExtraUsageWindow(data, { showEmojis: false, showBars: false }, 4);
    expect(result).toBe('extra: $4.28 (8.6%)');
  });

  it('returns empty string when data is null', () => {
    const result = formatExtraUsageWindow(null, DEFAULT_RENDER_OPTIONS, 4);
    expect(result).toBe('');
  });

  it('formats with different bar widths', () => {
    const data = { usedUsd: 25.0, utilizationPercent: 50.0 };
    const result = formatExtraUsageWindow(data, DEFAULT_RENDER_OPTIONS, 8);
    expect(result).toBe('✨ $25.00 [████░░░░] (50.0%)');
  });

  it('formats zero usage', () => {
    const data = { usedUsd: 0.0, utilizationPercent: 0.0 };
    const result = formatExtraUsageWindow(data, DEFAULT_RENDER_OPTIONS, 4);
    expect(result).toBe('✨ $0.00 [░░░░] (0.0%)');
  });

  it('formats high utilization percentage', () => {
    const data = { usedUsd: 48.5, utilizationPercent: 97.0 };
    const result = formatExtraUsageWindow(data, DEFAULT_RENDER_OPTIONS, 4);
    expect(result).toBe('✨ $48.50 [████] (97.0%)');
  });
});
