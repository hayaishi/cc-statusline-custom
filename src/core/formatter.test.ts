import { describe, it, expect } from 'vitest';
import {
  formatModelIndicator,
  formatSessionCost,
  formatContextUsage,
  formatTokensLowercase,
  formatTokensCompactLowercase,
  formatModelSegment,
  formatCostSegment,
  formatContextSegment,
  DEFAULT_RENDER_OPTIONS,
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

describe('formatTokensCompactLowercase', () => {
  it('returns empty string for null', () => {
    expect(formatTokensCompactLowercase(null)).toBe('');
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
    expect(formatCostSegment({ sessionCost: 0.23 })).toBe('💰 $0.23');
  });

  it('ignores invalid session cost', () => {
    expect(formatCostSegment({ sessionCost: NaN })).toBe('');
  });
});

describe('formatContextSegment', () => {
  it('returns placeholder with bar for undefined', () => {
    const result = formatContextSegment(undefined);
    expect(stripAnsi(result)).toBe('🧠 0 [░░░░░░░░] (0%)');
  });

  it('returns placeholder with bar when percentage is null', () => {
    const usage: TokenUsage = {
      current: 84000,
      limit: 200000,
      percentage: null,
    };
    const result = formatContextSegment(usage);
    expect(stripAnsi(result)).toBe('🧠 0 [░░░░░░░░] (0%)');
  });

  it('returns placeholder with bar when percentage is undefined', () => {
    const usage: TokenUsage = {
      current: 84000,
      limit: 200000,
      percentage: undefined as unknown as number,
    };
    const result = formatContextSegment(usage);
    expect(stripAnsi(result)).toBe('🧠 0 [░░░░░░░░] (0%)');
  });

  it('returns placeholder with bar when percentage is NaN', () => {
    const usage: TokenUsage = {
      current: 84000,
      limit: 200000,
      percentage: Number.NaN,
    };
    const result = formatContextSegment(usage);
    expect(stripAnsi(result)).toBe('🧠 0 [░░░░░░░░] (0%)');
  });

  it('returns placeholder with bar when percentage is Infinity', () => {
    const usage: TokenUsage = {
      current: 84000,
      limit: 200000,
      percentage: Number.POSITIVE_INFINITY,
    };
    const result = formatContextSegment(usage);
    expect(stripAnsi(result)).toBe('🧠 0 [░░░░░░░░] (0%)');
  });

  it('returns placeholder with bar when percentage is -Infinity', () => {
    const usage: TokenUsage = {
      current: 84000,
      limit: 200000,
      percentage: Number.NEGATIVE_INFINITY,
    };
    const result = formatContextSegment(usage);
    expect(stripAnsi(result)).toBe('🧠 0 [░░░░░░░░] (0%)');
  });

  it('formats full context segment with parentheses around percent', () => {
    const usage: TokenUsage = {
      current: 84000,
      limit: 200000,
      percentage: 42,
    };
    const result = formatContextSegment(usage);
    expect(stripAnsi(result)).toBe('🧠 84,000 [███░░░░░] (42%)');
  });

  it('uses 0 when current is null', () => {
    const usage: TokenUsage = {
      current: null,
      limit: 200000,
      percentage: 0,
    };
    const result = formatContextSegment(usage);
    expect(stripAnsi(result)).toBe('🧠 0 [░░░░░░░░] (0%)');
  });

  it('handles missing limit', () => {
    const usage: TokenUsage = {
      current: 84000,
      limit: null,
      percentage: 42,
    };
    const result = formatContextSegment(usage);
    expect(stripAnsi(result)).toBe('🧠 84,000 [███░░░░░] (42%)');
  });

  it('omits tokens when current is invalid but keeps bar', () => {
    const usage: TokenUsage = {
      current: -5,
      limit: 200000,
      percentage: 42,
    };
    const result = formatContextSegment(usage);
    expect(stripAnsi(result)).toBe('🧠 [███░░░░░] (42%)');
  });

  it('omits tokens and bar when current is invalid and bars disabled', () => {
    const usage: TokenUsage = {
      current: -5,
      limit: 200000,
      percentage: 42,
    };
    const result = formatContextSegment(usage, 50, 80, { showEmojis: true, showBars: false });
    expect(stripAnsi(result)).toBe('🧠 (42%)');
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
    expect(stripAnsi(lowResult)).toBe('🧠 50,000 [██░░░░░░] (25%)');
    expect(stripAnsi(medResult)).toBe('🧠 140,000 [██████░░] (70%)');
    expect(stripAnsi(highResult)).toBe('🧠 180,000 [███████░] (90%)');
  });

  it('respects custom thresholds', () => {
    const usage: TokenUsage = { current: 80000, limit: 200000, percentage: 40 };
    // With custom thresholds (30, 60), 40% should be in yellow zone
    const result = formatContextSegment(usage, 30, 60);
    expect(stripAnsi(result)).toBe('🧠 80,000 [███░░░░░] (40%)');
  });

  it('formats high token counts correctly', () => {
    const usage: TokenUsage = {
      current: 1500000,
      limit: 2000000,
      percentage: 75,
    };
    const result = formatContextSegment(usage);
    expect(stripAnsi(result)).toBe('🧠 1,500,000 [██████░░] (75%)');
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
      expect(result).toBe('💰 $0.23');
    });

    it('excludes emoji prefix when showEmojis is false', () => {
      const result = formatCostSegment({ sessionCost: 0.23 }, { showEmojis: false, showBars: true });
      expect(result).toBe('$0.23');
    });
  });

  describe('formatContextSegment with options', () => {
    const usage: TokenUsage = { current: 84000, limit: 200000, percentage: 42 };

    it('includes emoji prefix by default', () => {
      const result = formatContextSegment(usage, 50, 80, DEFAULT_RENDER_OPTIONS);
      const stripped = stripAnsi(result);
      expect(stripped).toBe('🧠 84,000 [███░░░░░] (42%)');
    });

    it('uses ctx: label when showEmojis is false', () => {
      const result = formatContextSegment(usage, 50, 80, { showEmojis: false, showBars: true });
      const stripped = stripAnsi(result);
      expect(stripped).toBe('ctx: 84,000 [███░░░░░] (42%)');
    });

    it('omits bar when showBars is false', () => {
      const result = formatContextSegment(usage, 50, 80, { showEmojis: false, showBars: false });
      const stripped = stripAnsi(result);
      expect(stripped).toBe('ctx: 84,000 (42%)');
    });

    it('uses ctx: label for placeholder when showEmojis is false', () => {
      const result = formatContextSegment(undefined, 50, 80, { showEmojis: false, showBars: true });
      const stripped = stripAnsi(result);
      expect(stripped).toBe('ctx: 0 [░░░░░░░░] (0%)');
    });

    it('omits bar in placeholder when showBars is false', () => {
      const result = formatContextSegment(undefined, 50, 80, { showEmojis: false, showBars: false });
      const stripped = stripAnsi(result);
      expect(stripped).toBe('ctx: 0 (0%)');
    });
  });

});
