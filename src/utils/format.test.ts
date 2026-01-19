import { describe, it, expect } from 'vitest';
import {
  formatCurrency,
  formatPercentage,
  formatTokens,
  formatDuration,
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
  it('formats zero', () => {
    expect(formatPercentage(0)).toBe('0%');
  });

  it('formats integer percentages', () => {
    expect(formatPercentage(42)).toBe('42%');
    expect(formatPercentage(100)).toBe('100%');
  });

  it('rounds decimal percentages', () => {
    expect(formatPercentage(42.4)).toBe('42%');
    expect(formatPercentage(42.5)).toBe('43%');
    expect(formatPercentage(42.9)).toBe('43%');
  });

  it('returns empty string for NaN', () => {
    expect(formatPercentage(NaN)).toBe('');
  });

  it('returns empty string for Infinity', () => {
    expect(formatPercentage(Infinity)).toBe('');
  });

  it('clamps negative to 0', () => {
    expect(formatPercentage(-10)).toBe('0%');
  });

  it('clamps above 100 to 100', () => {
    expect(formatPercentage(150)).toBe('100%');
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

  it('formats thousands with K suffix', () => {
    expect(formatTokens(1000)).toBe('1K');
    expect(formatTokens(1500)).toBe('1.5K');
    expect(formatTokens(25000)).toBe('25K');
    expect(formatTokens(25500)).toBe('25.5K');
  });

  it('formats millions with M suffix', () => {
    expect(formatTokens(1000000)).toBe('1M');
    expect(formatTokens(1500000)).toBe('1.5M');
  });

  it('rounds to 1 decimal for K/M values', () => {
    expect(formatTokens(1234)).toBe('1.2K');
    expect(formatTokens(1250)).toBe('1.3K');
  });

  it('omits decimal if .0', () => {
    expect(formatTokens(2000)).toBe('2K');
    expect(formatTokens(10000)).toBe('10K');
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
