import { describe, it, expect } from 'vitest';
import { parseOAuthUsage } from './oauth.js';

describe('parseOAuthUsage', () => {
  it('should parse legacy response when only five_hour is present', () => {
    const json = JSON.stringify({
      five_hour: {
        utilization: 0.5,
        resets_at: '2025-01-25T12:00:00Z',
      },
    });

    const result = parseOAuthUsage(json);

    expect(result.fiveHour).toEqual({
      utilization: 0.5,
      resetsAt: '2025-01-25T12:00:00Z',
    });
    expect(result.sevenDay).toBeUndefined();
  });

  it('should parse dual response when five_hour and seven_day are present', () => {
    const json = JSON.stringify({
      five_hour: {
        utilization: 0.5,
        resets_at: '2025-01-25T12:00:00Z',
      },
      seven_day: {
        utilization: 0.8,
        resets_at: '2025-02-01T12:00:00Z',
      },
    });

    const result = parseOAuthUsage(json);

    expect(result.fiveHour).toEqual({
      utilization: 0.5,
      resetsAt: '2025-01-25T12:00:00Z',
    });
    expect(result.sevenDay).toEqual({
      utilization: 0.8,
      resetsAt: '2025-02-01T12:00:00Z',
    });
  });

  it('should ignore seven_day when it is incomplete', () => {
    const json = JSON.stringify({
      five_hour: {
        utilization: 0.5,
        resets_at: '2025-01-25T12:00:00Z',
      },
      seven_day: {
        utilization: 0.8,
        // missing resets_at
      },
    });

    const result = parseOAuthUsage(json);

    expect(result.fiveHour).toBeDefined();
    expect(result.sevenDay).toBeUndefined();
  });

  it('should throw error when five_hour is missing', () => {
    const json = JSON.stringify({
      seven_day: {
        utilization: 0.8,
        resets_at: '2025-02-01T12:00:00Z',
      },
    });

    expect(() => parseOAuthUsage(json)).toThrow('oauth_response_invalid');
  });

  it('should throw error when five_hour has invalid types', () => {
    const json = JSON.stringify({
      five_hour: {
        utilization: '50%', // should be number
        resets_at: '2025-01-25T12:00:00Z',
      },
    });

    expect(() => parseOAuthUsage(json)).toThrow('oauth_response_invalid');
  });

  it('should throw error when JSON is invalid', () => {
    expect(() => parseOAuthUsage('invalid-json')).toThrow();
  });

  it('should ignore extra fields when present', () => {
    const json = JSON.stringify({
      five_hour: {
        utilization: 0.5,
        resets_at: '2025-01-25T12:00:00Z',
        extra: 'field',
      },
      other_window: {},
    });

    const result = parseOAuthUsage(json);
    expect(result.fiveHour.utilization).toBe(0.5);
  });
});
