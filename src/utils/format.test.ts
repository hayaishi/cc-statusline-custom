import { describe, it, expect } from 'vitest';
import {
  formatCurrency,
  formatPercentage,
  formatTokens,
  formatTokensCompact,
  formatTokensExact,
  formatDuration,
  formatProgressBar,
} from './format.js';

describe('formatCurrency', () => {
  it('formats zero', () => {
    expect(formatCurrency(0)).toBe('$0.00');
  });

  it('formats small values with 2 decimal places', () => {
    expect(formatCurrency(0.05)).toBe('$0.05');
    expect(formatCurrency(0.123)).toBe('$0.12');
  });

  it('formats dollar values', () => {
    expect(formatCurrency(1.5)).toBe('$1.50');
    expect(formatCurrency(10.99)).toBe('$10.99');
  });

  it('formats large values', () => {
    expect(formatCurrency(100)).toBe('$100.00');
    expect(formatCurrency(1234.56)).toBe('$1234.56');
    expect(formatCurrency(1234.567)).toBe('$1234.57');
  });

  it('returns empty string for NaN', () => {
    expect(formatCurrency(NaN)).toBe('');
  });

  it('returns empty string for Infinity', () => {
    expect(formatCurrency(Infinity)).toBe('');
    expect(formatCurrency(-Infinity)).toBe('');
  });

  it('handles negative values (edge case)', () => {
    // Negative costs should not happen, but handle gracefully
    expect(formatCurrency(-1)).toBe('');
  });
});

describe('formatPercentage', () => {
  it('wraps percentage in parentheses', () => {
    expect(formatPercentage(42)).toBe('(42%)');
    expect(formatPercentage(0)).toBe('(0%)');
    expect(formatPercentage(100)).toBe('(100%)');
  });

  it('rounds at 0.5 boundary', () => {
    expect(formatPercentage(42.4)).toBe('(42%)');
    expect(formatPercentage(42.5)).toBe('(43%)');
    expect(formatPercentage(42.9)).toBe('(43%)');
  });

  it('clamps out of range values', () => {
    expect(formatPercentage(-10)).toBe('(0%)');
    expect(formatPercentage(150)).toBe('(100%)');
  });

  it('returns empty string for invalid input', () => {
    expect(formatPercentage(NaN)).toBe('');
    expect(formatPercentage(Infinity)).toBe('');
  });
});

describe('formatTokens', () => {
  it('formats zero', () => {
    expect(formatTokens(0)).toBe('0');
  });

  it('formats small numbers as-is', () => {
    expect(formatTokens(100)).toBe('100');
    expect(formatTokens(999)).toBe('999');
  });

  it('formats thousands with lowercase k suffix and 1 decimal', () => {
    expect(formatTokens(1000)).toBe('1.0k');
    expect(formatTokens(1500)).toBe('1.5k');
    expect(formatTokens(25000)).toBe('25.0k');
    expect(formatTokens(25500)).toBe('25.5k');
  });

  it('formats millions with lowercase m suffix and 1 decimal', () => {
    expect(formatTokens(1000000)).toBe('1.0m');
    expect(formatTokens(1500000)).toBe('1.5m');
  });

  it('rounds to 1 decimal for k/m values', () => {
    expect(formatTokens(1234)).toBe('1.2k');
    expect(formatTokens(1250)).toBe('1.3k');
  });

  it('always shows 1 decimal place for k/m values', () => {
    expect(formatTokens(2000)).toBe('2.0k');
    expect(formatTokens(10000)).toBe('10.0k');
  });

  it('promotes to m when k-rounded value >= 1000', () => {
    // 999_999 rounds to 1000.0k, so promote to 1.0m
    expect(formatTokens(999_999)).toBe('1.0m');
    // 999_949 rounds to 999.9k, stays as k
    expect(formatTokens(999_949)).toBe('999.9k');
    // 999_950 rounds to 1000.0k, promotes to 1.0m
    expect(formatTokens(999_950)).toBe('1.0m');
  });

  it('returns empty string for NaN', () => {
    expect(formatTokens(NaN)).toBe('');
  });

  it('returns empty string for Infinity', () => {
    expect(formatTokens(Infinity)).toBe('');
  });

  it('handles negative values (edge case)', () => {
    expect(formatTokens(-100)).toBe('');
  });
});

describe('formatTokensCompact', () => {
  it('formats zero', () => {
    expect(formatTokensCompact(0)).toBe('0');
  });

  it('formats small numbers as-is', () => {
    expect(formatTokensCompact(100)).toBe('100');
    expect(formatTokensCompact(999)).toBe('999');
  });

  it('formats thousands with lowercase k suffix', () => {
    expect(formatTokensCompact(1000)).toBe('1k');
    expect(formatTokensCompact(1500)).toBe('1.5k');
    expect(formatTokensCompact(25000)).toBe('25k');
    expect(formatTokensCompact(25500)).toBe('25.5k');
  });

  it('formats millions with lowercase m suffix', () => {
    expect(formatTokensCompact(1000000)).toBe('1m');
    expect(formatTokensCompact(1500000)).toBe('1.5m');
  });

  it('strips .0 for round numbers', () => {
    expect(formatTokensCompact(2000)).toBe('2k');
    expect(formatTokensCompact(10000)).toBe('10k');
    expect(formatTokensCompact(200000)).toBe('200k');
  });

  it('promotes to m when k-rounded value >= 1000', () => {
    // 999_999 rounds to 1000k, so promote to 1m
    expect(formatTokensCompact(999_999)).toBe('1m');
    // 999_949 rounds to 999.9k, stays as k
    expect(formatTokensCompact(999_949)).toBe('999.9k');
    // 999_950 rounds to 1000k, promotes to 1m
    expect(formatTokensCompact(999_950)).toBe('1m');
  });

  it('returns empty string for NaN', () => {
    expect(formatTokensCompact(NaN)).toBe('');
  });

  it('returns empty string for Infinity', () => {
    expect(formatTokensCompact(Infinity)).toBe('');
  });

  it('handles negative values (edge case)', () => {
    expect(formatTokensCompact(-100)).toBe('');
  });
});

describe('formatTokensExact', () => {
  it('formats zero', () => {
    expect(formatTokensExact(0)).toBe('0');
  });

  it('formats small numbers without separators', () => {
    expect(formatTokensExact(100)).toBe('100');
    expect(formatTokensExact(999)).toBe('999');
  });

  it('formats thousands with separators', () => {
    expect(formatTokensExact(1000)).toBe('1,000');
    expect(formatTokensExact(84000)).toBe('84,000');
    expect(formatTokensExact(1500000)).toBe('1,500,000');
  });

  it('drops fractional values', () => {
    expect(formatTokensExact(1234.56)).toBe('1,234');
  });

  it('returns empty string for NaN', () => {
    expect(formatTokensExact(NaN)).toBe('');
  });

  it('returns empty string for Infinity', () => {
    expect(formatTokensExact(Infinity)).toBe('');
  });

  it('handles negative values (edge case)', () => {
    expect(formatTokensExact(-100)).toBe('');
  });
});

describe('formatDuration', () => {
  it('formats zero seconds', () => {
    expect(formatDuration(0)).toBe('0m');
  });

  it('formats seconds as minutes', () => {
    expect(formatDuration(30)).toBe('0m');
    expect(formatDuration(60)).toBe('1m');
    expect(formatDuration(90)).toBe('1m');
    expect(formatDuration(120)).toBe('2m');
  });

  it('formats hours and minutes', () => {
    expect(formatDuration(3600)).toBe('1h 0m');
    expect(formatDuration(3660)).toBe('1h 1m');
    expect(formatDuration(7200)).toBe('2h 0m');
    expect(formatDuration(9900)).toBe('2h 45m');
  });

  it('formats large durations', () => {
    expect(formatDuration(86400)).toBe('24h 0m');
  });

  it('returns empty string for NaN', () => {
    expect(formatDuration(NaN)).toBe('');
  });

  it('returns empty string for Infinity', () => {
    expect(formatDuration(Infinity)).toBe('');
  });

  it('handles negative values (edge case)', () => {
    expect(formatDuration(-100)).toBe('');
  });
});

describe('formatProgressBar', () => {
  it('formats 0%', () => {
    expect(formatProgressBar(0)).toBe('[░░░░░░░░]');
  });

  it('formats 100%', () => {
    expect(formatProgressBar(100)).toBe('[████████]');
  });

  it('formats 50%', () => {
    expect(formatProgressBar(50)).toBe('[████░░░░]');
  });

  it('formats intermediate values', () => {
    expect(formatProgressBar(12.5)).toBe('[█░░░░░░░]');
    expect(formatProgressBar(25)).toBe('[██░░░░░░]');
    expect(formatProgressBar(75)).toBe('[██████░░]');
  });

  it('rounds to nearest block', () => {
    // 6.25% per block (100/8 = 12.5 per block)
    expect(formatProgressBar(6)).toBe('[░░░░░░░░]');
    expect(formatProgressBar(7)).toBe('[█░░░░░░░]');
  });

  it('clamps negative values to 0', () => {
    expect(formatProgressBar(-10)).toBe('[░░░░░░░░]');
  });

  it('clamps values over 100 to 100', () => {
    expect(formatProgressBar(150)).toBe('[████████]');
  });

  it('returns empty string for NaN', () => {
    expect(formatProgressBar(NaN)).toBe('');
  });

  it('returns empty string for Infinity', () => {
    expect(formatProgressBar(Infinity)).toBe('');
  });

  it('supports custom width', () => {
    expect(formatProgressBar(50, 4)).toBe('[██░░]');
    expect(formatProgressBar(50, 10)).toBe('[█████░░░░░]');
  });
});

describe('formatProgressBar boundary coverage', () => {
  it('shows 0 blocks for 0-6%', () => {
    expect(formatProgressBar(0)).toBe('[░░░░░░░░]');
    expect(formatProgressBar(1)).toBe('[░░░░░░░░]');
    expect(formatProgressBar(6)).toBe('[░░░░░░░░]');
  });

  it('shows 1 block for 7-18%', () => {
    expect(formatProgressBar(7)).toBe('[█░░░░░░░]');
    expect(formatProgressBar(12)).toBe('[█░░░░░░░]');
    expect(formatProgressBar(18)).toBe('[█░░░░░░░]');
  });

  it('shows correct blocks at key percentages', () => {
    expect(formatProgressBar(42)).toBe('[███░░░░░]');
    expect(formatProgressBar(99)).toBe('[████████]');
    expect(formatProgressBar(100)).toBe('[████████]');
  });
});
