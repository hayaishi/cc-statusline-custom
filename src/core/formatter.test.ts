import { describe, it, expect } from 'vitest';
import {
  formatModelIndicator,
  formatSessionCost,
  formatContextUsage,
  formatTokensLowercase,
  formatModelSegment,
  formatCostSegment,
  formatContextSegment,
  formatSubscriptionUsageAllSegment,
  DEFAULT_RENDER_OPTIONS,
  type WindowData,
} from './formatter.js';
import { stripAnsi } from '../utils/colors.js';
import type { TokenUsage } from './parser.js';

describe('formatModelIndicator', () => {
  it('returns empty string for undefined', () => {
    expect(formatModelIndicator(undefined)).toBe('');
  });

  it('returns empty string for empty string', () => {
    expect(formatModelIndicator('')).toBe('');
  });

  it('returns empty string for whitespace-only', () => {
    expect(formatModelIndicator('   ')).toBe('');
  });

  it('formats display name as-is', () => {
    expect(formatModelIndicator('Claude Opus 4.5')).toBe('Opus');
  });

  it('extracts model family from display name', () => {
    expect(formatModelIndicator('Claude Sonnet 4')).toBe('Sonnet');
    expect(formatModelIndicator('Claude Haiku')).toBe('Haiku');
  });

  it('handles model ID format', () => {
    expect(formatModelIndicator('claude-opus-4-5-20251101')).toBe('Opus');
    expect(formatModelIndicator('claude-sonnet-4-20250514')).toBe('Sonnet');
  });

  it('returns trimmed name for unknown format', () => {
    expect(formatModelIndicator('CustomModel')).toBe('CustomModel');
  });
});

describe('formatSessionCost', () => {
  it('returns empty string for undefined', () => {
    expect(formatSessionCost(undefined)).toBe('');
  });

  it('returns empty string for NaN', () => {
    expect(formatSessionCost(NaN)).toBe('');
  });

  it('returns empty string for negative', () => {
    expect(formatSessionCost(-1)).toBe('');
  });

  it('formats zero cost', () => {
    expect(formatSessionCost(0)).toBe('$0.00');
  });

  it('formats small costs', () => {
    expect(formatSessionCost(0.05)).toBe('$0.05');
    expect(formatSessionCost(0.23)).toBe('$0.23');
  });

  it('formats larger costs', () => {
    expect(formatSessionCost(1.5)).toBe('$1.50');
    expect(formatSessionCost(12.34)).toBe('$12.34');
  });
});

describe('formatContextUsage', () => {
  it('returns empty string for undefined', () => {
    expect(formatContextUsage(undefined)).toBe('');
  });

  it('returns empty string for NaN', () => {
    expect(formatContextUsage(NaN)).toBe('');
  });

  it('formats zero percentage with parentheses', () => {
    expect(formatContextUsage(0)).toBe('(0%)');
  });

  it('formats percentage values with parentheses', () => {
    expect(formatContextUsage(42)).toBe('(42%)');
    expect(formatContextUsage(100)).toBe('(100%)');
  });

  it('rounds decimal percentages', () => {
    expect(formatContextUsage(42.4)).toBe('(42%)');
    expect(formatContextUsage(42.6)).toBe('(43%)');
  });

  it('clamps to 0-100 range', () => {
    expect(formatContextUsage(-10)).toBe('(0%)');
    expect(formatContextUsage(150)).toBe('(100%)');
  });
});

// ============================================================================
// NEW SEGMENT FORMATTER TESTS
// ============================================================================

describe('formatTokensLowercase', () => {
  it('returns empty string for null', () => {
    expect(formatTokensLowercase(null)).toBe('');
  });

  it('formats small numbers without suffix', () => {
    expect(formatTokensLowercase(100)).toBe('100');
    expect(formatTokensLowercase(999)).toBe('999');
  });

  it('formats thousands with lowercase k suffix and 1 decimal', () => {
    expect(formatTokensLowercase(1000)).toBe('1.0k');
    expect(formatTokensLowercase(25000)).toBe('25.0k');
    expect(formatTokensLowercase(25500)).toBe('25.5k');
  });

  it('formats millions with lowercase m suffix and 1 decimal', () => {
    expect(formatTokensLowercase(1000000)).toBe('1.0m');
    expect(formatTokensLowercase(1500000)).toBe('1.5m');
  });
});

describe('formatModelSegment', () => {
  it('returns empty string for undefined', () => {
    expect(formatModelSegment(undefined)).toBe('');
  });

  it('returns empty string for empty string', () => {
    expect(formatModelSegment('')).toBe('');
  });

  it('formats model with emoji prefix', () => {
    expect(formatModelSegment('Claude Opus 4.5')).toBe('🤖 Opus');
  });

  it('extracts model family with emoji', () => {
    expect(formatModelSegment('Claude Sonnet 4')).toBe('🤖 Sonnet');
    expect(formatModelSegment('Claude Haiku')).toBe('🤖 Haiku');
  });

  it('handles model ID format', () => {
    expect(formatModelSegment('claude-opus-4-5-20251101')).toBe('🤖 Opus');
  });

  it('formats unknown model with emoji', () => {
    expect(formatModelSegment('CustomModel')).toBe('🤖 CustomModel');
  });
});

describe('formatCostSegment', () => {
  it('returns empty string for empty data', () => {
    expect(formatCostSegment({})).toBe('');
  });

  it('formats session cost only', () => {
    expect(formatCostSegment({ sessionCost: 0.23 })).toBe('💰 $0.23 sess');
  });

  it('ignores invalid session cost', () => {
    expect(formatCostSegment({ sessionCost: NaN })).toBe('');
  });
});

describe('formatContextSegment', () => {
  it('returns placeholder with bar for undefined', () => {
    const result = formatContextSegment(undefined);
    expect(stripAnsi(result)).toBe('🧠 [░░░░░░░░] (0%)');
  });

  it('returns placeholder with bar when percentage is null', () => {
    const usage: TokenUsage = {
      current: 84000,
      limit: 200000,
      percentage: null,
    };
    const result = formatContextSegment(usage);
    expect(stripAnsi(result)).toBe('🧠 [░░░░░░░░] (0%)');
  });

  it('returns placeholder with bar when percentage is undefined', () => {
    const usage: TokenUsage = {
      current: 84000,
      limit: 200000,
      percentage: undefined as unknown as number,
    };
    const result = formatContextSegment(usage);
    expect(stripAnsi(result)).toBe('🧠 [░░░░░░░░] (0%)');
  });

  it('returns placeholder with bar when percentage is NaN', () => {
    const usage: TokenUsage = {
      current: 84000,
      limit: 200000,
      percentage: Number.NaN,
    };
    const result = formatContextSegment(usage);
    expect(stripAnsi(result)).toBe('🧠 [░░░░░░░░] (0%)');
  });

  it('returns placeholder with bar when percentage is Infinity', () => {
    const usage: TokenUsage = {
      current: 84000,
      limit: 200000,
      percentage: Number.POSITIVE_INFINITY,
    };
    const result = formatContextSegment(usage);
    expect(stripAnsi(result)).toBe('🧠 [░░░░░░░░] (0%)');
  });

  it('returns placeholder with bar when percentage is -Infinity', () => {
    const usage: TokenUsage = {
      current: 84000,
      limit: 200000,
      percentage: Number.NEGATIVE_INFINITY,
    };
    const result = formatContextSegment(usage);
    expect(stripAnsi(result)).toBe('🧠 [░░░░░░░░] (0%)');
  });

  it('formats full context segment with parentheses around percent', () => {
    const usage: TokenUsage = {
      current: 84000,
      limit: 200000,
      percentage: 42,
    };
    const result = formatContextSegment(usage);
    expect(stripAnsi(result)).toBe('🧠 84.0k/200k [███░░░░░] (42%)');
  });

  it('uses 0 when current is null', () => {
    const usage: TokenUsage = {
      current: null,
      limit: 200000,
      percentage: 0,
    };
    const result = formatContextSegment(usage);
    expect(stripAnsi(result)).toBe('🧠 0/200k [░░░░░░░░] (0%)');
  });

  it('handles missing limit', () => {
    const usage: TokenUsage = {
      current: 84000,
      limit: null,
      percentage: 42,
    };
    const result = formatContextSegment(usage);
    expect(stripAnsi(result)).toBe('🧠 84.0k [███░░░░░] (42%)');
  });

  it('applies correct colors based on thresholds', () => {
    const lowUsage: TokenUsage = { current: 50000, limit: 200000, percentage: 25 };
    const medUsage: TokenUsage = { current: 140000, limit: 200000, percentage: 70 };
    const highUsage: TokenUsage = { current: 180000, limit: 200000, percentage: 90 };

    // All should produce valid output with color codes
    const lowResult = formatContextSegment(lowUsage);
    const medResult = formatContextSegment(medUsage);
    const highResult = formatContextSegment(highUsage);

    // Strip ANSI to verify content
    expect(stripAnsi(lowResult)).toBe('🧠 50.0k/200k [██░░░░░░] (25%)');
    expect(stripAnsi(medResult)).toBe('🧠 140.0k/200k [██████░░] (70%)');
    expect(stripAnsi(highResult)).toBe('🧠 180.0k/200k [███████░] (90%)');
  });

  it('respects custom thresholds', () => {
    const usage: TokenUsage = { current: 80000, limit: 200000, percentage: 40 };
    // With custom thresholds (30, 60), 40% should be in yellow zone
    const result = formatContextSegment(usage, 30, 60);
    expect(stripAnsi(result)).toBe('🧠 80.0k/200k [███░░░░░] (40%)');
  });

  it('formats high token counts correctly', () => {
    const usage: TokenUsage = {
      current: 1500000,
      limit: 2000000,
      percentage: 75,
    };
    const result = formatContextSegment(usage);
    expect(stripAnsi(result)).toBe('🧠 1.5m/2m [██████░░] (75%)');
  });
});

// ============================================================================
// RENDER OPTIONS TESTS
// ============================================================================

describe('RenderOptions - no-emojis behavior', () => {
  describe('formatModelSegment with options', () => {
    it('includes emoji prefix by default', () => {
      const result = formatModelSegment('Claude Opus', DEFAULT_RENDER_OPTIONS);
      expect(result).toBe('🤖 Opus');
    });

    it('excludes emoji prefix when showEmojis is false', () => {
      const result = formatModelSegment('Claude Opus', { showEmojis: false, showBars: true });
      expect(result).toBe('Opus');
    });
  });

  describe('formatCostSegment with options', () => {
    it('includes emoji prefix by default', () => {
      const result = formatCostSegment({ sessionCost: 0.23 }, DEFAULT_RENDER_OPTIONS);
      expect(result).toBe('💰 $0.23 sess');
    });

    it('excludes emoji prefix when showEmojis is false', () => {
      const result = formatCostSegment({ sessionCost: 0.23 }, { showEmojis: false, showBars: true });
      expect(result).toBe('$0.23 sess');
    });
  });

  describe('formatContextSegment with options', () => {
    const usage: TokenUsage = { current: 84000, limit: 200000, percentage: 42 };

    it('includes emoji prefix by default', () => {
      const result = formatContextSegment(usage, 50, 80, DEFAULT_RENDER_OPTIONS);
      const stripped = stripAnsi(result);
      expect(stripped).toBe('🧠 84.0k/200k [███░░░░░] (42%)');
    });

    it('uses ctx: label when showEmojis is false', () => {
      const result = formatContextSegment(usage, 50, 80, { showEmojis: false, showBars: true });
      const stripped = stripAnsi(result);
      expect(stripped).toBe('ctx: 84.0k/200k [███░░░░░] (42%)');
    });

    it('uses ctx: label for placeholder when showEmojis is false', () => {
      const result = formatContextSegment(undefined, 50, 80, { showEmojis: false, showBars: true });
      const stripped = stripAnsi(result);
      expect(stripped).toBe('ctx: [░░░░░░░░] (0%)');
    });
  });

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

describe('formatSubscriptionUsageAllSegment', () => {
  const fiveHourData: WindowData = { percent: 55, reset: '~3:45pm' };
  const sevenDayData: WindowData = { percent: 55, reset: '~10:45pm, Feb 1' };

  it('formats both windows with emojis and bars (default)', () => {
    const result = formatSubscriptionUsageAllSegment(fiveHourData, sevenDayData, DEFAULT_RENDER_OPTIONS);
    expect(result).toBe('⌛️ 55% [██░░] (~3:45pm) 🌙 55% [██░░] (~10:45pm, Feb 1)');
  });

  it('formats with no-emojis', () => {
    const result = formatSubscriptionUsageAllSegment(fiveHourData, sevenDayData, { showEmojis: false, showBars: true });
    expect(result).toBe('5h: 55% [██░░] (~3:45pm) 7d: 55% [██░░] (~10:45pm, Feb 1)');
  });

  it('formats with no-bars', () => {
    const result = formatSubscriptionUsageAllSegment(fiveHourData, sevenDayData, { showEmojis: true, showBars: false });
    expect(result).toBe('⌛️ 55% (~3:45pm) 🌙 55% (~10:45pm, Feb 1)');
  });

  it('formats with both flags disabled', () => {
    const result = formatSubscriptionUsageAllSegment(fiveHourData, sevenDayData, { showEmojis: false, showBars: false });
    expect(result).toBe('5h: 55% (~3:45pm) 7d: 55% (~10:45pm, Feb 1)');
  });

  it('uses half-width bars (4 chars instead of 8)', () => {
    const result = formatSubscriptionUsageAllSegment(
      { percent: 0, reset: '~12:00am' },
      { percent: 100, reset: '~11:59pm, Dec 31' },
      DEFAULT_RENDER_OPTIONS
    );
    // 0% should be [░░░░] (4 empty), 100% should be [████] (4 filled)
    expect(result).toBe('⌛️ 0% [░░░░] (~12:00am) 🌙 100% [████] (~11:59pm, Dec 31)');
  });

  it('returns empty string when fiveHour is null', () => {
    const result = formatSubscriptionUsageAllSegment(null, sevenDayData, DEFAULT_RENDER_OPTIONS);
    expect(result).toBe('');
  });

  it('returns empty string when fiveHour percent is not finite', () => {
    const result = formatSubscriptionUsageAllSegment({ percent: NaN, reset: '~3:45pm' }, sevenDayData, DEFAULT_RENDER_OPTIONS);
    expect(result).toBe('');
  });

  it('returns empty string when fiveHour reset is empty', () => {
    const result = formatSubscriptionUsageAllSegment({ percent: 55, reset: '' }, sevenDayData, DEFAULT_RENDER_OPTIONS);
    expect(result).toBe('');
  });

  it('formats only fiveHour when sevenDay is null', () => {
    const result = formatSubscriptionUsageAllSegment(fiveHourData, null, DEFAULT_RENDER_OPTIONS);
    expect(result).toBe('⌛️ 55% [██░░] (~3:45pm)');
  });

  it('formats single window with seven_day label when configured', () => {
    const result = formatSubscriptionUsageAllSegment(
      sevenDayData,
      null,
      DEFAULT_RENDER_OPTIONS,
      { primaryWindowType: 'seven_day', barWidth: 8 }
    );
    expect(result).toBe('🌙 55% [████░░░░] (~10:45pm, Feb 1)');
  });

  it('formats only fiveHour when sevenDay percent is not finite', () => {
    const result = formatSubscriptionUsageAllSegment(fiveHourData, { percent: Infinity, reset: '~10:45pm, Feb 1' }, DEFAULT_RENDER_OPTIONS);
    expect(result).toBe('⌛️ 55% [██░░] (~3:45pm)');
  });

  it('formats only fiveHour when sevenDay reset is empty', () => {
    const result = formatSubscriptionUsageAllSegment(fiveHourData, { percent: 55, reset: '   ' }, DEFAULT_RENDER_OPTIONS);
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
