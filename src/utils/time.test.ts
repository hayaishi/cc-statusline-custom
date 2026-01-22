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
});
