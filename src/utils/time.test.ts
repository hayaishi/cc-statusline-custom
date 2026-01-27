import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { formatResetTime } from './time.js';

describe('formatResetTime', () => {
  const originalTz = process.env.TZ;

  beforeAll(() => {
    process.env.TZ = 'UTC';
  });

  afterAll(() => {
    if (originalTz === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = originalTz;
    }
  });

  it('formats afternoon time with lowercase am/pm', () => {
    expect(formatResetTime('2026-01-20T15:45:00Z')).toBe('~3:45pm');
  });

  it('formats midnight as 12am', () => {
    expect(formatResetTime('2026-01-20T00:05:00Z')).toBe('~12:05am');
  });

  it('formats noon as 12pm', () => {
    expect(formatResetTime('2026-01-20T12:00:00Z')).toBe('~12:00pm');
  });

  it('returns empty string for invalid input', () => {
    expect(formatResetTime('not-a-date')).toBe('');
  });

  describe('with windowType parameter', () => {
    it('formats five_hour with time only', () => {
      expect(formatResetTime('2026-01-20T15:45:00Z', 'five_hour')).toBe('~3:45pm');
    });

    it('formats seven_day with time and date', () => {
      expect(formatResetTime('2026-02-01T22:45:00Z', 'seven_day')).toBe('~10:45pm, 1 Feb');
    });

    it('formats seven_day with different date', () => {
      expect(formatResetTime('2026-12-25T10:30:00Z', 'seven_day')).toBe('~10:30am, 25 Dec');
    });

    it('formats seven_day with single-digit day', () => {
      expect(formatResetTime('2026-03-05T14:15:00Z', 'seven_day')).toBe('~2:15pm, 5 Mar');
    });

    it('defaults to time-only when windowType is undefined', () => {
      expect(formatResetTime('2026-01-20T15:45:00Z')).toBe('~3:45pm');
    });

    it('returns empty string for invalid input with seven_day', () => {
      expect(formatResetTime('not-a-date', 'seven_day')).toBe('');
    });
  });
});
