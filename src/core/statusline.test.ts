import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { generateStatusline, FALLBACK_OUTPUT, generateStatuslineWithExtended } from './statusline.js';
import type { ClaudeCodeInput } from '../types/claude-code.js';
import type { DailyTotalEntry, BurnRateEntry } from '../types/cache.js';

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
        model: 'Claude Opus 4.5',
      };
      const result = generateStatusline(input);
      expect(result.trim().length).toBeGreaterThan(0);
    });

    it('never returns empty string', () => {
      const testCases: (ClaudeCodeInput | null)[] = [
        null,
        {},
        { model: { display_name: 'Claude Opus 4.5' } },
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
        { model: { display_name: 'Claude Opus 4.5' } },
        { model: 'test\nwith\nnewlines' },
        {
          model: { display_name: 'Claude Opus 4.5' },
          cost: { total_cost_usd: 1.5 },
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

  describe('fast-path metric composition', () => {
    it('formats full input as "Model | $Cost | Usage%"', () => {
      const input: ClaudeCodeInput = {
        model: { display_name: 'Claude Opus 4.5' },
        cost: { total_cost_usd: 0.23 },
        context_window: { used_percentage: 42 },
      };
      const result = generateStatusline(input);
      expect(result).toBe('Opus | $0.23 | 42%');
    });

    it('formats nested schema correctly', () => {
      const input: ClaudeCodeInput = {
        model: { display_name: 'Claude Sonnet 4', id: 'claude-sonnet-4' },
        cost: { total_cost_usd: 1.5 },
        context_window: { used_percentage: 75 },
      };
      const result = generateStatusline(input);
      expect(result).toBe('Sonnet | $1.50 | 75%');
    });

    it('formats flat schema (backward compat)', () => {
      const input: ClaudeCodeInput = {
        model: 'claude-opus-4-5-20251101',
        cost_usd: 0.05,
        context_window: { used_percentage: 10 },
      };
      const result = generateStatusline(input);
      expect(result).toBe('Opus | $0.05 | 10%');
    });

    it('omits missing metrics gracefully', () => {
      // Only model
      const modelOnly: ClaudeCodeInput = {
        model: { display_name: 'Claude Haiku' },
      };
      expect(generateStatusline(modelOnly)).toBe('Haiku');

      // Model + cost
      const modelAndCost: ClaudeCodeInput = {
        model: { display_name: 'Claude Haiku' },
        cost: { total_cost_usd: 0.01 },
      };
      expect(generateStatusline(modelAndCost)).toBe('Haiku | $0.01');

      // Model + context
      const modelAndContext: ClaudeCodeInput = {
        model: { display_name: 'Claude Haiku' },
        context_window: { used_percentage: 5 },
      };
      expect(generateStatusline(modelAndContext)).toBe('Haiku | 5%');
    });

    it('returns fallback for empty object', () => {
      expect(generateStatusline({})).toBe(FALLBACK_OUTPUT);
    });

    it('returns fallback for null', () => {
      expect(generateStatusline(null)).toBe(FALLBACK_OUTPUT);
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

  describe('fallback output', () => {
    it('fallback output is visible and non-empty', () => {
      expect(FALLBACK_OUTPUT.trim().length).toBeGreaterThan(0);
    });
  });
});

describe('generateStatuslineWithExtended', () => {
  const testCacheDir = join(tmpdir(), `ccusage-statusline-ext-test-${String(process.pid)}`);

  beforeEach(() => {
    if (!existsSync(testCacheDir)) {
      mkdirSync(testCacheDir, { recursive: true });
    }
  });

  afterEach(() => {
    if (existsSync(testCacheDir)) {
      rmSync(testCacheDir, { recursive: true, force: true });
    }
  });

  it('returns fast-path only when cache is empty', () => {
    const input: ClaudeCodeInput = {
      model: { display_name: 'Claude Opus 4.5' },
      cost: { total_cost_usd: 0.23 },
      context_window: { used_percentage: 42 },
    };

    const result = generateStatuslineWithExtended(input, testCacheDir);
    expect(result).toBe('Opus | $0.23 | 42%');
  });

  it('appends daily total when cache has fresh daily-total.json', () => {
    const input: ClaudeCodeInput = {
      model: { display_name: 'Claude Opus 4.5' },
      cost: { total_cost_usd: 0.23 },
      context_window: { used_percentage: 42 },
    };

    // Create fresh cache entry
    const dailyEntry: DailyTotalEntry = {
      cost_usd: 1.50,
      date: new Date().toISOString().slice(0, 10),
      updated_at: Date.now(),
    };
    writeFileSync(join(testCacheDir, 'daily-total.json'), JSON.stringify(dailyEntry));

    const result = generateStatuslineWithExtended(input, testCacheDir);
    expect(result).toBe('Opus | $0.23 | 42% | $1.50 today');
  });

  it('appends burn rate when cache has fresh burn-rate.json', () => {
    const input: ClaudeCodeInput = {
      model: { display_name: 'Claude Opus 4.5' },
      cost: { total_cost_usd: 0.23 },
      context_window: { used_percentage: 42 },
    };

    // Create fresh cache entry
    const burnEntry: BurnRateEntry = {
      rate_per_hour: 0.12,
      updated_at: Date.now(),
    };
    writeFileSync(join(testCacheDir, 'burn-rate.json'), JSON.stringify(burnEntry));

    const result = generateStatuslineWithExtended(input, testCacheDir);
    expect(result).toBe('Opus | $0.23 | 42% | $0.12/hr');
  });

  it('appends both daily total and burn rate when both caches are fresh', () => {
    const input: ClaudeCodeInput = {
      model: { display_name: 'Claude Opus 4.5' },
      cost: { total_cost_usd: 0.23 },
      context_window: { used_percentage: 42 },
    };

    // Create fresh cache entries
    const dailyEntry: DailyTotalEntry = {
      cost_usd: 1.50,
      date: new Date().toISOString().slice(0, 10),
      updated_at: Date.now(),
    };
    writeFileSync(join(testCacheDir, 'daily-total.json'), JSON.stringify(dailyEntry));

    const burnEntry: BurnRateEntry = {
      rate_per_hour: 0.12,
      updated_at: Date.now(),
    };
    writeFileSync(join(testCacheDir, 'burn-rate.json'), JSON.stringify(burnEntry));

    const result = generateStatuslineWithExtended(input, testCacheDir);
    expect(result).toBe('Opus | $0.23 | 42% | $1.50 today | $0.12/hr');
  });

  it('returns fallback when input is null and cache is empty', () => {
    const result = generateStatuslineWithExtended(null, testCacheDir);
    expect(result).toBe(FALLBACK_OUTPUT);
  });

  it('gracefully handles corrupt cache files', () => {
    const input: ClaudeCodeInput = {
      model: { display_name: 'Claude Opus 4.5' },
    };

    // Create corrupt cache file
    writeFileSync(join(testCacheDir, 'daily-total.json'), 'not valid json');

    const result = generateStatuslineWithExtended(input, testCacheDir);
    expect(result).toBe('Opus');
  });
});
