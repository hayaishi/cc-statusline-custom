import { describe, it, expect } from 'vitest';
import {
  formatModelIndicator,
  formatSessionCost,
  formatContextUsage,
  formatBurnRate,
  formatDailyTotal,
} from './formatter.js';

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
