import { describe, it, expect } from 'vitest';
import {
  parseInput,
  extractModelDisplayName,
  extractSessionCost,
  extractContextUsage,
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
