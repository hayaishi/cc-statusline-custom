import { describe, it, expect } from 'vitest';
import { parseInput } from './parser.js';

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
});
