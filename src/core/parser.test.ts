import { describe, it, expect } from 'vitest';
import {
  parseInput,
  extractModelDisplayName,
  extractSessionCost,
  extractContextUsage,
  extractTokenUsage,
  extractRateLimitWindow,
} from './parser.js';
import type { ClaudeCodeInput } from '../types/claude-code.js';

describe('parseInput', () => {
  describe('invalid inputs return null', () => {
    it('returns null for empty string', () => {
      expect(parseInput('')).toBeNull();
    });

    it('returns null for whitespace-only string', () => {
      expect(parseInput('   ')).toBeNull();
      expect(parseInput('\n\t')).toBeNull();
    });

    it('returns null for invalid JSON', () => {
      expect(parseInput('not json')).toBeNull();
      expect(parseInput('{ invalid }')).toBeNull();
      expect(parseInput('undefined')).toBeNull();
    });

    it('returns null for JSON arrays', () => {
      expect(parseInput('[]')).toBeNull();
      expect(parseInput('[1, 2, 3]')).toBeNull();
    });

    it('returns null for JSON primitives', () => {
      expect(parseInput('null')).toBeNull();
      expect(parseInput('123')).toBeNull();
      expect(parseInput('"string"')).toBeNull();
      expect(parseInput('true')).toBeNull();
    });
  });

  describe('valid JSON objects', () => {
    it('parses empty object', () => {
      const result = parseInput('{}');
      expect(result).toEqual({});
    });

    it('parses object with model field', () => {
      const result = parseInput('{"model": "claude-3-opus"}');
      expect(result).toEqual({ model: 'claude-3-opus' });
    });

    it('parses object with cost_usd field', () => {
      const result = parseInput('{"cost_usd": 0.05}');
      expect(result).toEqual({ cost_usd: 0.05 });
    });

    it('parses object with context_window', () => {
      const input = JSON.stringify({
        context_window: {
          used_percentage: 42.5,
          total_input_tokens: 10000,
        },
      });
      const result = parseInput(input);
      expect(result).toEqual({
        context_window: {
          used_percentage: 42.5,
          total_input_tokens: 10000,
        },
      });
    });

    it('parses object with current_usage', () => {
      const input = JSON.stringify({
        current_usage: {
          input_tokens: 500,
          output_tokens: 200,
        },
      });
      const result = parseInput(input);
      expect(result).toEqual({
        current_usage: {
          input_tokens: 500,
          output_tokens: 200,
        },
      });
    });

    it('parses complete payload', () => {
      const input = JSON.stringify({
        model: 'claude-3-sonnet',
        cost_usd: 0.123,
        context_window: {
          used_percentage: 75,
          total_input_tokens: 50000,
          total_output_tokens: 5000,
        },
        current_usage: {
          input_tokens: 1000,
          output_tokens: 500,
          cache_creation_input_tokens: 100,
          cache_read_input_tokens: 50,
        },
      });
      const result = parseInput(input);
      expect(result).toEqual({
        model: 'claude-3-sonnet',
        cost_usd: 0.123,
        context_window: {
          used_percentage: 75,
          total_input_tokens: 50000,
          total_output_tokens: 5000,
        },
        current_usage: {
          input_tokens: 1000,
          output_tokens: 500,
          cache_creation_input_tokens: 100,
          cache_read_input_tokens: 50,
        },
      });
    });

    it('preserves unknown fields (forward compatibility)', () => {
      const result = parseInput('{"unknown_field": "value", "model": "test"}');
      expect(result).toEqual({ unknown_field: 'value', model: 'test' });
    });
  });

  describe('edge cases', () => {
    it('handles JSON with trailing whitespace', () => {
      expect(parseInput('{}  \n')).toEqual({});
    });

    it('handles JSON with leading whitespace', () => {
      expect(parseInput('  \n{}')).toEqual({});
    });
  });

  describe('nested schema (official Claude Code format)', () => {
    it('parses nested model object', () => {
      const input = JSON.stringify({
        model: {
          id: 'claude-opus-4-5-20251101',
          display_name: 'Claude Opus 4.5',
        },
      });
      const result = parseInput(input);
      expect(result).toEqual({
        model: {
          id: 'claude-opus-4-5-20251101',
          display_name: 'Claude Opus 4.5',
        },
      });
    });

    it('parses nested cost object', () => {
      const input = JSON.stringify({
        cost: {
          total_cost_usd: 0.23,
          total_duration_ms: 45000,
          total_api_duration_ms: 12000,
          total_lines_added: 150,
          total_lines_removed: 30,
        },
      });
      const result = parseInput(input);
      expect(result).toEqual({
        cost: {
          total_cost_usd: 0.23,
          total_duration_ms: 45000,
          total_api_duration_ms: 12000,
          total_lines_added: 150,
          total_lines_removed: 30,
        },
      });
    });

    it('parses context_window with nested current_usage', () => {
      const input = JSON.stringify({
        context_window: {
          total_input_tokens: 50000,
          total_output_tokens: 5000,
          context_window_size: 200000,
          used_percentage: 27.5,
          remaining_percentage: 72.5,
          current_usage: {
            input_tokens: 1000,
            output_tokens: 500,
            cache_creation_input_tokens: 100,
            cache_read_input_tokens: 50,
          },
        },
      });
      const result = parseInput(input);
      expect(result).toEqual({
        context_window: {
          total_input_tokens: 50000,
          total_output_tokens: 5000,
          context_window_size: 200000,
          used_percentage: 27.5,
          remaining_percentage: 72.5,
          current_usage: {
            input_tokens: 1000,
            output_tokens: 500,
            cache_creation_input_tokens: 100,
            cache_read_input_tokens: 50,
          },
        },
      });
    });

    it('parses context_window with null current_usage (no messages yet)', () => {
      const input = JSON.stringify({
        context_window: {
          used_percentage: 0,
          remaining_percentage: 100,
          current_usage: null,
        },
      });
      const result = parseInput(input);
      expect(result).toEqual({
        context_window: {
          used_percentage: 0,
          remaining_percentage: 100,
          current_usage: null,
        },
      });
    });

    it('parses full Claude Code schema payload', () => {
      const input = JSON.stringify({
        hook_event_name: 'Status',
        session_id: 'abc-123',
        transcript_path: '/path/to/transcript',
        cwd: '/Users/test/project',
        version: '1.0.0',
        model: {
          id: 'claude-opus-4-5-20251101',
          display_name: 'Claude Opus 4.5',
        },
        workspace: {
          current_dir: '/Users/test/project',
          project_dir: '/Users/test/project',
        },
        output_style: {
          name: 'default',
        },
        cost: {
          total_cost_usd: 0.23,
          total_duration_ms: 45000,
          total_api_duration_ms: 12000,
          total_lines_added: 150,
          total_lines_removed: 30,
        },
        context_window: {
          total_input_tokens: 50000,
          total_output_tokens: 5000,
          context_window_size: 200000,
          used_percentage: 27.5,
          remaining_percentage: 72.5,
          current_usage: {
            input_tokens: 1000,
            output_tokens: 500,
            cache_creation_input_tokens: 100,
            cache_read_input_tokens: 50,
          },
        },
      });
      const result = parseInput(input);
      expect(result).not.toBeNull();
      expect(result?.hook_event_name).toBe('Status');
      expect(result?.session_id).toBe('abc-123');
      expect(result?.model).toEqual({
        id: 'claude-opus-4-5-20251101',
        display_name: 'Claude Opus 4.5',
      });
      expect(result?.cost).toEqual({
        total_cost_usd: 0.23,
        total_duration_ms: 45000,
        total_api_duration_ms: 12000,
        total_lines_added: 150,
        total_lines_removed: 30,
      });
      expect(result?.context_window?.used_percentage).toBe(27.5);
    });
  });

  describe('backward compatibility (flat schema)', () => {
    it('still parses flat model string', () => {
      const result = parseInput('{"model": "claude-3-opus"}');
      expect(result).toEqual({ model: 'claude-3-opus' });
    });

    it('still parses flat cost_usd', () => {
      const result = parseInput('{"cost_usd": 0.05}');
      expect(result).toEqual({ cost_usd: 0.05 });
    });

    it('parses mixed flat and nested fields', () => {
      const input = JSON.stringify({
        model: 'claude-3-opus',
        cost: {
          total_cost_usd: 0.23,
        },
        context_window: {
          used_percentage: 42,
        },
      });
      const result = parseInput(input);
      expect(result?.model).toBe('claude-3-opus');
      expect(result?.cost?.total_cost_usd).toBe(0.23);
      expect(result?.context_window?.used_percentage).toBe(42);
    });
  });
});

describe('extractModelDisplayName', () => {
  it('returns undefined for null input', () => {
    expect(extractModelDisplayName(null)).toBeUndefined();
  });

  it('returns undefined for empty object', () => {
    expect(extractModelDisplayName({} as ClaudeCodeInput)).toBeUndefined();
  });

  it('extracts display_name from nested model object', () => {
    const input: ClaudeCodeInput = {
      model: { display_name: 'Claude Opus 4.5', id: 'claude-opus-4-5' },
    };
    expect(extractModelDisplayName(input)).toBe('Claude Opus 4.5');
  });

  it('extracts id from nested model object if display_name is missing', () => {
    const input: ClaudeCodeInput = {
      model: { id: 'claude-opus-4-5' },
    };
    expect(extractModelDisplayName(input)).toBe('claude-opus-4-5');
  });

  it('returns flat model string', () => {
    const input: ClaudeCodeInput = {
      model: 'claude-3-opus',
    };
    expect(extractModelDisplayName(input)).toBe('claude-3-opus');
  });
});

describe('extractSessionCost', () => {
  it('returns undefined for null input', () => {
    expect(extractSessionCost(null)).toBeUndefined();
  });

  it('returns undefined for empty object', () => {
    expect(extractSessionCost({} as ClaudeCodeInput)).toBeUndefined();
  });

  it('extracts total_cost_usd from nested cost object', () => {
    const input: ClaudeCodeInput = {
      cost: { total_cost_usd: 0.23 },
    };
    expect(extractSessionCost(input)).toBe(0.23);
  });

  it('returns flat cost_usd', () => {
    const input: ClaudeCodeInput = {
      cost_usd: 0.05,
    };
    expect(extractSessionCost(input)).toBe(0.05);
  });

  it('prefers nested cost over flat cost_usd', () => {
    const input: ClaudeCodeInput = {
      cost: { total_cost_usd: 0.23 },
      cost_usd: 0.05, // flat fallback should be ignored
    };
    expect(extractSessionCost(input)).toBe(0.23);
  });
});

describe('extractContextUsage', () => {
  it('returns undefined for null input', () => {
    expect(extractContextUsage(null)).toBeUndefined();
  });

  it('returns undefined for empty object', () => {
    expect(extractContextUsage({} as ClaudeCodeInput)).toBeUndefined();
  });

  it('extracts used_percentage from context_window', () => {
    const input: ClaudeCodeInput = {
      context_window: { used_percentage: 42 },
    };
    expect(extractContextUsage(input)).toBe(42);
  });

  it('returns undefined if context_window.used_percentage is missing', () => {
    const input: ClaudeCodeInput = {
      context_window: {},
    };
    expect(extractContextUsage(input)).toBeUndefined();
  });
});

describe('extractTokenUsage', () => {
  it('returns undefined for null input', () => {
    expect(extractTokenUsage(null)).toBeUndefined();
  });

  it('returns undefined for empty object', () => {
    expect(extractTokenUsage({} as ClaudeCodeInput)).toBeUndefined();
  });

  it('returns undefined if context_window is missing', () => {
    const input: ClaudeCodeInput = {
      model: 'test',
    };
    expect(extractTokenUsage(input)).toBeUndefined();
  });

  it('extracts full token usage from current_usage', () => {
    const input: ClaudeCodeInput = {
      context_window: {
        context_window_size: 200000,
        used_percentage: 42,
        current_usage: {
          input_tokens: 80000,
          output_tokens: 4000,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
        },
      },
    };
    const result = extractTokenUsage(input);
    expect(result).toEqual({
      current: 84000,
      limit: 200000,
      percentage: 42,
    });
  });

  it('sums all token fields from current_usage', () => {
    const input: ClaudeCodeInput = {
      context_window: {
        context_window_size: 200000,
        used_percentage: 50,
        current_usage: {
          input_tokens: 50000,
          output_tokens: 10000,
          cache_creation_input_tokens: 5000,
          cache_read_input_tokens: 5000,
        },
      },
    };
    const result = extractTokenUsage(input);
    expect(result?.current).toBe(70000);
  });

  it('handles missing token fields with defaults of 0', () => {
    const input: ClaudeCodeInput = {
      context_window: {
        context_window_size: 200000,
        used_percentage: 25,
        current_usage: {
          input_tokens: 50000,
          // other fields missing
        },
      },
    };
    const result = extractTokenUsage(input);
    expect(result?.current).toBe(50000);
  });

  it('returns current as null when current_usage is null', () => {
    const input: ClaudeCodeInput = {
      context_window: {
        context_window_size: 200000,
        used_percentage: 0,
        current_usage: null,
      },
    };
    const result = extractTokenUsage(input);
    expect(result).toEqual({
      current: null,
      limit: 200000,
      percentage: 0,
    });
  });

  it('returns current as null when current_usage is undefined', () => {
    const input: ClaudeCodeInput = {
      context_window: {
        context_window_size: 200000,
        used_percentage: 10,
      },
    };
    const result = extractTokenUsage(input);
    expect(result).toEqual({
      current: null,
      limit: 200000,
      percentage: 10,
    });
  });

  it('rounds percentage with .5 rounding up', () => {
    const input: ClaudeCodeInput = {
      context_window: {
        used_percentage: 42.5,
      },
    };
    const result = extractTokenUsage(input);
    expect(result?.percentage).toBe(43);
  });

  it('rounds percentage down for values below .5', () => {
    const input: ClaudeCodeInput = {
      context_window: {
        used_percentage: 42.4,
      },
    };
    const result = extractTokenUsage(input);
    expect(result?.percentage).toBe(42);
  });

  it('rounds percentage up for values above .5', () => {
    const input: ClaudeCodeInput = {
      context_window: {
        used_percentage: 42.6,
      },
    };
    const result = extractTokenUsage(input);
    expect(result?.percentage).toBe(43);
  });

  it('returns percentage null when used_percentage is undefined', () => {
    const input: ClaudeCodeInput = {
      context_window: {
        context_window_size: 200000,
      },
    };
    const result = extractTokenUsage(input);
    expect(result?.percentage).toBeNull();
  });

  it('returns limit null when context_window_size is undefined', () => {
    const input: ClaudeCodeInput = {
      context_window: {
        used_percentage: 42,
      },
    };
    const result = extractTokenUsage(input);
    expect(result?.limit).toBeNull();
  });

  it('handles empty context_window object', () => {
    const input: ClaudeCodeInput = {
      context_window: {},
    };
    const result = extractTokenUsage(input);
    expect(result).toEqual({
      current: null,
      limit: null,
      percentage: null,
    });
  });

  describe('percentage validation and clamping', () => {
    it('returns percentage null when used_percentage is NaN', () => {
      const input: ClaudeCodeInput = {
        context_window: {
          used_percentage: NaN,
          context_window_size: 200000,
        },
      };
      const result = extractTokenUsage(input);
      expect(result?.percentage).toBeNull();
    });

    it('returns percentage null when used_percentage is Infinity', () => {
      const input: ClaudeCodeInput = {
        context_window: {
          used_percentage: Infinity,
          context_window_size: 200000,
        },
      };
      const result = extractTokenUsage(input);
      expect(result?.percentage).toBeNull();
    });

    it('returns percentage null when used_percentage is -Infinity', () => {
      const input: ClaudeCodeInput = {
        context_window: {
          used_percentage: -Infinity,
          context_window_size: 200000,
        },
      };
      const result = extractTokenUsage(input);
      expect(result?.percentage).toBeNull();
    });

    it('clamps negative percentage to 0', () => {
      const input: ClaudeCodeInput = {
        context_window: {
          used_percentage: -1,
          context_window_size: 200000,
        },
      };
      const result = extractTokenUsage(input);
      expect(result?.percentage).toBe(0);
    });

    it('clamps percentage above 100 to 100', () => {
      const input: ClaudeCodeInput = {
        context_window: {
          used_percentage: 101,
          context_window_size: 200000,
        },
      };
      const result = extractTokenUsage(input);
      expect(result?.percentage).toBe(100);
    });

    it('clamps large negative percentage to 0', () => {
      const input: ClaudeCodeInput = {
        context_window: {
          used_percentage: -50,
          context_window_size: 200000,
        },
      };
      const result = extractTokenUsage(input);
      expect(result?.percentage).toBe(0);
    });

    it('clamps large percentage above 100 to 100', () => {
      const input: ClaudeCodeInput = {
        context_window: {
          used_percentage: 999,
          context_window_size: 200000,
        },
      };
      const result = extractTokenUsage(input);
      expect(result?.percentage).toBe(100);
    });
  });
});

describe('extractRateLimitWindow', () => {
  const validEpoch = 1_766_084_400; // 2025-12-18 somewhere, well under year 2100

  describe('returns valid data when input is correct', () => {
    it('should extract five_hour window when present and valid', () => {
      const input: ClaudeCodeInput = {
        rate_limits: { five_hour: { used_percentage: 55, resets_at: validEpoch } },
      };
      expect(extractRateLimitWindow(input, 'five_hour')).toEqual({
        percent: 55,
        resetsAtEpochSec: validEpoch,
      });
    });

    it('should extract seven_day window when present and valid', () => {
      const input: ClaudeCodeInput = {
        rate_limits: { seven_day: { used_percentage: 20, resets_at: validEpoch } },
      };
      expect(extractRateLimitWindow(input, 'seven_day')).toEqual({
        percent: 20,
        resetsAtEpochSec: validEpoch,
      });
    });

    it('should return valid data when percent is 0', () => {
      const input: ClaudeCodeInput = {
        rate_limits: { five_hour: { used_percentage: 0, resets_at: validEpoch } },
      };
      expect(extractRateLimitWindow(input, 'five_hour')?.percent).toBe(0);
    });

    it('should return valid data when percent is 100', () => {
      const input: ClaudeCodeInput = {
        rate_limits: { five_hour: { used_percentage: 100, resets_at: validEpoch } },
      };
      expect(extractRateLimitWindow(input, 'five_hour')?.percent).toBe(100);
    });
  });

  describe('returns null when rate_limits is absent or window is missing', () => {
    it('should return null when rate_limits is absent', () => {
      const input: ClaudeCodeInput = {};
      expect(extractRateLimitWindow(input, 'five_hour')).toBeNull();
    });

    it('should return null when requested window is absent', () => {
      const input: ClaudeCodeInput = {
        rate_limits: { seven_day: { used_percentage: 20, resets_at: validEpoch } },
      };
      expect(extractRateLimitWindow(input, 'five_hour')).toBeNull();
    });
  });

  describe('returns null when used_percentage is invalid', () => {
    it('should return null when used_percentage is a float', () => {
      const input: ClaudeCodeInput = {
        rate_limits: { five_hour: { used_percentage: 55.5, resets_at: validEpoch } },
      };
      expect(extractRateLimitWindow(input, 'five_hour')).toBeNull();
    });

    it('should return null when used_percentage is negative', () => {
      const input: ClaudeCodeInput = {
        rate_limits: { five_hour: { used_percentage: -1, resets_at: validEpoch } },
      };
      expect(extractRateLimitWindow(input, 'five_hour')).toBeNull();
    });

    it('should return null when used_percentage is 101', () => {
      const input: ClaudeCodeInput = {
        rate_limits: { five_hour: { used_percentage: 101, resets_at: validEpoch } },
      };
      expect(extractRateLimitWindow(input, 'five_hour')).toBeNull();
    });

    it('should return null when used_percentage is NaN', () => {
      const input: ClaudeCodeInput = {
        rate_limits: { five_hour: { used_percentage: NaN, resets_at: validEpoch } },
      };
      expect(extractRateLimitWindow(input, 'five_hour')).toBeNull();
    });

    it('should return null when used_percentage is absent', () => {
      const input: ClaudeCodeInput = {
        rate_limits: { five_hour: { resets_at: validEpoch } },
      };
      expect(extractRateLimitWindow(input, 'five_hour')).toBeNull();
    });
  });

  describe('returns null when resets_at is invalid', () => {
    it('should return null when resets_at is zero', () => {
      const input: ClaudeCodeInput = {
        rate_limits: { five_hour: { used_percentage: 50, resets_at: 0 } },
      };
      expect(extractRateLimitWindow(input, 'five_hour')).toBeNull();
    });

    it('should return null when resets_at is negative', () => {
      const input: ClaudeCodeInput = {
        rate_limits: { five_hour: { used_percentage: 50, resets_at: -1 } },
      };
      expect(extractRateLimitWindow(input, 'five_hour')).toBeNull();
    });

    it('should return null when resets_at exceeds year 2100 (likely milliseconds)', () => {
      // 4_102_444_801 is just above the year-2100 threshold
      const input: ClaudeCodeInput = {
        rate_limits: { five_hour: { used_percentage: 50, resets_at: 4_102_444_801 } },
      };
      expect(extractRateLimitWindow(input, 'five_hour')).toBeNull();
    });

    it('should return null when resets_at is absent', () => {
      const input: ClaudeCodeInput = {
        rate_limits: { five_hour: { used_percentage: 50 } },
      };
      expect(extractRateLimitWindow(input, 'five_hour')).toBeNull();
    });

    it('should return null when resets_at is Infinity', () => {
      const input: ClaudeCodeInput = {
        rate_limits: { five_hour: { used_percentage: 50, resets_at: Infinity } },
      };
      expect(extractRateLimitWindow(input, 'five_hour')).toBeNull();
    });
  });
});
