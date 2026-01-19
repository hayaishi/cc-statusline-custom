import { describe, it, expect } from 'vitest';
import {
  formatModelIndicator,
  formatSessionCost,
  formatContextUsage,
  formatBurnRate,
  formatDailyTotal,
  formatTokensLowercase,
  formatModelSegment,
  formatCostSegment,
  formatBurnRateSegment,
  formatContextSegment,
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

  it('formats zero percentage', () => {
    expect(formatContextUsage(0)).toBe('0%');
  });

  it('formats percentage values', () => {
    expect(formatContextUsage(42)).toBe('42%');
    expect(formatContextUsage(100)).toBe('100%');
  });

  it('rounds decimal percentages', () => {
    expect(formatContextUsage(42.4)).toBe('42%');
    expect(formatContextUsage(42.6)).toBe('43%');
  });

  it('clamps to 0-100 range', () => {
    expect(formatContextUsage(-10)).toBe('0%');
    expect(formatContextUsage(150)).toBe('100%');
  });
});

describe('formatBurnRate', () => {
  it('returns empty string for undefined', () => {
    expect(formatBurnRate(undefined)).toBe('');
  });

  it('returns empty string for NaN', () => {
    expect(formatBurnRate(NaN)).toBe('');
  });

  it('returns empty string for negative', () => {
    expect(formatBurnRate(-1)).toBe('');
  });

  it('formats zero rate', () => {
    expect(formatBurnRate(0)).toBe('$0.00/hr');
  });

  it('formats hourly rates', () => {
    expect(formatBurnRate(0.12)).toBe('$0.12/hr');
    expect(formatBurnRate(1.5)).toBe('$1.50/hr');
  });
});

describe('formatDailyTotal', () => {
  it('returns empty string for undefined', () => {
    expect(formatDailyTotal(undefined)).toBe('');
  });

  it('returns empty string for NaN', () => {
    expect(formatDailyTotal(NaN)).toBe('');
  });

  it('returns empty string for negative', () => {
    expect(formatDailyTotal(-1)).toBe('');
  });

  it('formats daily total', () => {
    expect(formatDailyTotal(0)).toBe('$0.00 today');
    expect(formatDailyTotal(1.23)).toBe('$1.23 today');
    expect(formatDailyTotal(12.5)).toBe('$12.50 today');
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

  it('formats thousands with lowercase k suffix', () => {
    expect(formatTokensLowercase(1000)).toBe('1k');
    expect(formatTokensLowercase(25000)).toBe('25k');
    expect(formatTokensLowercase(25500)).toBe('25.5k');
  });

  it('formats millions with lowercase m suffix', () => {
    expect(formatTokensLowercase(1000000)).toBe('1m');
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

  it('formats session and daily total', () => {
    expect(formatCostSegment({ sessionCost: 0.23, dailyTotal: 1.23 }))
      .toBe('💰 $0.23 sess / $1.23 today');
  });

  it('formats full cost segment with block', () => {
    expect(formatCostSegment({
      sessionCost: 0.23,
      dailyTotal: 1.23,
      blockCost: 0.45,
      blockTimeRemaining: 9900, // 2h 45m
    })).toBe('💰 $0.23 sess / $1.23 today / $0.45 (2h 45m left)');
  });

  it('formats block cost without time remaining', () => {
    expect(formatCostSegment({
      sessionCost: 0.23,
      blockCost: 0.45,
    })).toBe('💰 $0.23 sess / $0.45');
  });

  it('formats block cost with zero time remaining', () => {
    expect(formatCostSegment({
      sessionCost: 0.23,
      blockCost: 0.45,
      blockTimeRemaining: 0,
    })).toBe('💰 $0.23 sess / $0.45');
  });

  it('handles only daily total', () => {
    expect(formatCostSegment({ dailyTotal: 1.23 }))
      .toBe('💰 $1.23 today');
  });

  it('handles only block cost', () => {
    expect(formatCostSegment({ blockCost: 0.45, blockTimeRemaining: 3600 }))
      .toBe('💰 $0.45 (1h 0m left)');
  });

  it('ignores invalid session cost', () => {
    expect(formatCostSegment({ sessionCost: NaN, dailyTotal: 1.23 }))
      .toBe('💰 $1.23 today');
  });
});

describe('formatBurnRateSegment', () => {
  it('returns empty string for undefined', () => {
    expect(formatBurnRateSegment(undefined)).toBe('');
  });

  it('returns empty string for NaN', () => {
    expect(formatBurnRateSegment(NaN)).toBe('');
  });

  it('formats burn rate with emoji', () => {
    expect(formatBurnRateSegment(0.12)).toBe('🔥 $0.12/hr');
    expect(formatBurnRateSegment(1.5)).toBe('🔥 $1.50/hr');
  });

  it('formats zero burn rate', () => {
    expect(formatBurnRateSegment(0)).toBe('🔥 $0.00/hr');
  });
});

describe('formatContextSegment', () => {
  it('returns empty string for undefined', () => {
    expect(formatContextSegment(undefined)).toBe('');
  });

  it('returns empty string when percentage is null', () => {
    const usage: TokenUsage = {
      current: 84000,
      limit: 200000,
      percentage: null,
    };
    expect(formatContextSegment(usage)).toBe('');
  });

  it('formats full context segment', () => {
    const usage: TokenUsage = {
      current: 84000,
      limit: 200000,
      percentage: 42,
    };
    const result = formatContextSegment(usage);
    expect(stripAnsi(result)).toBe('🧠 84k/200k [███░░░░░] 42%');
  });

  it('uses 0 when current is null', () => {
    const usage: TokenUsage = {
      current: null,
      limit: 200000,
      percentage: 0,
    };
    const result = formatContextSegment(usage);
    expect(stripAnsi(result)).toBe('🧠 0/200k [░░░░░░░░] 0%');
  });

  it('handles missing limit', () => {
    const usage: TokenUsage = {
      current: 84000,
      limit: null,
      percentage: 42,
    };
    const result = formatContextSegment(usage);
    expect(stripAnsi(result)).toBe('🧠 84k [███░░░░░] 42%');
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
    expect(stripAnsi(lowResult)).toBe('🧠 50k/200k [██░░░░░░] 25%');
    expect(stripAnsi(medResult)).toBe('🧠 140k/200k [██████░░] 70%');
    expect(stripAnsi(highResult)).toBe('🧠 180k/200k [███████░] 90%');
  });

  it('respects custom thresholds', () => {
    const usage: TokenUsage = { current: 80000, limit: 200000, percentage: 40 };
    // With custom thresholds (30, 60), 40% should be in yellow zone
    const result = formatContextSegment(usage, 30, 60);
    expect(stripAnsi(result)).toBe('🧠 80k/200k [███░░░░░] 40%');
  });

  it('formats high token counts correctly', () => {
    const usage: TokenUsage = {
      current: 1500000,
      limit: 2000000,
      percentage: 75,
    };
    const result = formatContextSegment(usage);
    expect(stripAnsi(result)).toBe('🧠 1.5m/2m [██████░░] 75%');
  });
});
