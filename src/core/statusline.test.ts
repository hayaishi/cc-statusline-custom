import { describe, it, expect } from 'vitest';
import { generateStatusline, FALLBACK_OUTPUT } from './statusline.js';
import type { ClaudeCodeInput } from '../types/claude-code.js';

describe('generateStatusline', () => {
  describe('NEVER silent - always returns visible output', () => {
    it('returns non-empty fallback for null input', () => {
      const result = generateStatusline(null);
      expect(result.trim().length).toBeGreaterThan(0);
      expect(result).toBe(FALLBACK_OUTPUT);
    });

    it('returns non-empty string for empty object', () => {
      const result = generateStatusline({});
      expect(result.trim().length).toBeGreaterThan(0);
    });

    it('returns non-empty string for partial input', () => {
      const input: ClaudeCodeInput = {
        model: 'test-model',
      };
      const result = generateStatusline(input);
      expect(result.trim().length).toBeGreaterThan(0);
    });

    it('never returns empty string', () => {
      const testCases: (ClaudeCodeInput | null)[] = [
        null,
        {},
        { model: 'test' },
        { model: '' },
        { cost_usd: 0 },
      ];

      for (const input of testCases) {
        const result = generateStatusline(input);
        expect(result).not.toBe('');
        expect(result.trim()).not.toBe('');
      }
    });
  });

  describe('output guarantees', () => {
    it('never returns multi-line output', () => {
      const testCases: (ClaudeCodeInput | null)[] = [
        null,
        {},
        { model: 'test' },
        { model: 'test\nwith\nnewlines' },
        {
          model: 'claude-3-opus',
          cost_usd: 1.5,
          context_window: { used_percentage: 50 },
        },
      ];

      for (const input of testCases) {
        const result = generateStatusline(input);
        const lineCount = result.split('\n').length;
        expect(lineCount).toBe(1);
      }
    });

    it('handles input with newlines gracefully', () => {
      const input: ClaudeCodeInput = {
        model: 'test\nmodel',
      };
      const result = generateStatusline(input);
      expect(result).not.toContain('\n');
    });
  });

  describe('fallback output format (bootstrap phase)', () => {
    it('returns fallback for null', () => {
      expect(generateStatusline(null)).toBe(FALLBACK_OUTPUT);
    });

    it('returns fallback for empty object', () => {
      expect(generateStatusline({})).toBe(FALLBACK_OUTPUT);
    });

    it('returns fallback for partial input', () => {
      expect(generateStatusline({ model: 'test' })).toBe(FALLBACK_OUTPUT);
    });

    it('fallback output is visible and non-empty', () => {
      expect(FALLBACK_OUTPUT.trim().length).toBeGreaterThan(0);
    });
  });

  describe('error resilience', () => {
    it('handles malformed objects gracefully and returns visible output', () => {
      const weirdInputs = [
        { cost_usd: NaN },
        { cost_usd: Infinity },
        { cost_usd: -Infinity },
        { context_window: null },
        { model: '' },
      ];

      for (const input of weirdInputs) {
        expect(() => generateStatusline(input as ClaudeCodeInput)).not.toThrow();
        const result = generateStatusline(input as ClaudeCodeInput);
        expect(result.trim().length).toBeGreaterThan(0);
      }
    });
  });
});
