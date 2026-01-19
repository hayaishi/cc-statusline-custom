import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { generateStatusline, FALLBACK_OUTPUT, generateStatuslineWithExtended } from './statusline.js';
import type { ClaudeCodeInput } from '../types/claude-code.js';
import type { DailyTotalEntry, BurnRateEntry, BlockInfoEntry } from '../types/cache.js';
import { stripAnsi } from '../utils/colors.js';

describe('generateStatusline', () => {
  const testCacheDir = join(tmpdir(), `ccusage-statusline-test-${String(process.pid)}`);

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

  describe('NEVER silent - always returns visible output', () => {
    it('returns non-empty fallback for null input', () => {
      const result = generateStatusline(null, testCacheDir);
      expect(result.trim().length).toBeGreaterThan(0);
      expect(result).toBe(FALLBACK_OUTPUT);
    });

    it('returns non-empty string for empty object', () => {
      const result = generateStatusline({}, testCacheDir);
      expect(result.trim().length).toBeGreaterThan(0);
    });

    it('returns non-empty string for partial input', () => {
      const input: ClaudeCodeInput = {
        model: 'Claude Opus 4.5',
      };
      const result = generateStatusline(input, testCacheDir);
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
        const result = generateStatusline(input, testCacheDir);
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
          context_window: { used_percentage: 50, context_window_size: 200000 },
        },
      ];

      for (const input of testCases) {
        const result = generateStatusline(input, testCacheDir);
        const lineCount = result.split('\n').length;
        expect(lineCount).toBe(1);
      }
    });

    it('handles input with newlines gracefully', () => {
      const input: ClaudeCodeInput = {
        model: 'test\nmodel',
      };
      const result = generateStatusline(input, testCacheDir);
      expect(result).not.toContain('\n');
    });
  });

  describe('new legacy format composition', () => {
    it('formats full input with emojis and new format', () => {
      const input: ClaudeCodeInput = {
        model: { display_name: 'Claude Opus 4.5' },
        cost: { total_cost_usd: 0.23 },
        context_window: {
          used_percentage: 42,
          context_window_size: 200000,
          current_usage: {
            input_tokens: 80000,
            output_tokens: 4000,
          },
        },
      };
      const result = generateStatusline(input, testCacheDir);
      // Strip ANSI for assertion
      expect(stripAnsi(result)).toBe('🤖 Opus | 💰 $0.23 sess | 🧠 84k/200k [███░░░░░] 42%');
    });

    it('formats nested schema correctly', () => {
      const input: ClaudeCodeInput = {
        model: { display_name: 'Claude Sonnet 4', id: 'claude-sonnet-4' },
        cost: { total_cost_usd: 1.5 },
        context_window: {
          used_percentage: 75,
          context_window_size: 200000,
          current_usage: { input_tokens: 150000 },
        },
      };
      const result = generateStatusline(input, testCacheDir);
      expect(stripAnsi(result)).toBe('🤖 Sonnet | 💰 $1.50 sess | 🧠 150k/200k [██████░░] 75%');
    });

    it('formats flat schema (backward compat)', () => {
      const input: ClaudeCodeInput = {
        model: 'claude-opus-4-5-20251101',
        cost_usd: 0.05,
        context_window: {
          used_percentage: 10,
          context_window_size: 200000,
          current_usage: { input_tokens: 20000 },
        },
      };
      const result = generateStatusline(input, testCacheDir);
      expect(stripAnsi(result)).toBe('🤖 Opus | 💰 $0.05 sess | 🧠 20k/200k [█░░░░░░░] 10%');
    });

    it('omits missing metrics gracefully', () => {
      // Only model
      const modelOnly: ClaudeCodeInput = {
        model: { display_name: 'Claude Haiku' },
      };
      expect(stripAnsi(generateStatusline(modelOnly, testCacheDir))).toBe('🤖 Haiku');

      // Model + cost
      const modelAndCost: ClaudeCodeInput = {
        model: { display_name: 'Claude Haiku' },
        cost: { total_cost_usd: 0.01 },
      };
      expect(stripAnsi(generateStatusline(modelAndCost, testCacheDir))).toBe('🤖 Haiku | 💰 $0.01 sess');

      // Model + context
      const modelAndContext: ClaudeCodeInput = {
        model: { display_name: 'Claude Haiku' },
        context_window: {
          used_percentage: 5,
          context_window_size: 200000,
          current_usage: { input_tokens: 10000 },
        },
      };
      expect(stripAnsi(generateStatusline(modelAndContext, testCacheDir))).toBe('🤖 Haiku | 🧠 10k/200k [░░░░░░░░] 5%');
    });

    it('returns fallback for empty object', () => {
      expect(generateStatusline({}, testCacheDir)).toBe(FALLBACK_OUTPUT);
    });

    it('returns fallback for null', () => {
      expect(generateStatusline(null, testCacheDir)).toBe(FALLBACK_OUTPUT);
    });
  });

  describe('context with null current_usage', () => {
    it('handles current_usage: null without throwing', () => {
      const input: ClaudeCodeInput = {
        model: { display_name: 'Claude Opus 4.5' },
        context_window: {
          used_percentage: 0,
          context_window_size: 200000,
          current_usage: null,
        },
      };
      const result = generateStatusline(input, testCacheDir);
      expect(result.split('\n').length).toBe(1);
      expect(stripAnsi(result)).toBe('🤖 Opus | 🧠 0/200k [░░░░░░░░] 0%');
    });
  });

  describe('percentage rounding', () => {
    it('rounds .5 up', () => {
      const input: ClaudeCodeInput = {
        model: { display_name: 'Claude Opus 4.5' },
        context_window: {
          used_percentage: 42.5,
          context_window_size: 200000,
          current_usage: { input_tokens: 85000 },
        },
      };
      const result = generateStatusline(input, testCacheDir);
      expect(stripAnsi(result)).toContain('43%');
    });

    it('rounds .4 down', () => {
      const input: ClaudeCodeInput = {
        model: { display_name: 'Claude Opus 4.5' },
        context_window: {
          used_percentage: 42.4,
          context_window_size: 200000,
          current_usage: { input_tokens: 84800 },
        },
      };
      const result = generateStatusline(input, testCacheDir);
      expect(stripAnsi(result)).toContain('42%');
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
        expect(() => generateStatusline(input as ClaudeCodeInput, testCacheDir)).not.toThrow();
        const result = generateStatusline(input as ClaudeCodeInput, testCacheDir);
        expect(result.trim().length).toBeGreaterThan(0);
      }
    });
  });

  describe('fallback output', () => {
    it('fallback output is visible and non-empty', () => {
      expect(FALLBACK_OUTPUT.trim().length).toBeGreaterThan(0);
    });

    it('fallback output has expected format', () => {
      expect(FALLBACK_OUTPUT).toBe('🤖 ? | ⏳ Loading...');
    });
  });
});

describe('generateStatuslineWithExtended (cache integration)', () => {
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

  it('returns basic output when cache is empty', () => {
    const input: ClaudeCodeInput = {
      model: { display_name: 'Claude Opus 4.5' },
      cost: { total_cost_usd: 0.23 },
      context_window: {
        used_percentage: 42,
        context_window_size: 200000,
        current_usage: { input_tokens: 84000 },
      },
    };

    const result = generateStatuslineWithExtended(input, testCacheDir);
    expect(stripAnsi(result)).toBe('🤖 Opus | 💰 $0.23 sess | 🧠 84k/200k [███░░░░░] 42%');
  });

  it('includes daily total in cost segment when cache has fresh daily-total.json', () => {
    const input: ClaudeCodeInput = {
      model: { display_name: 'Claude Opus 4.5' },
      cost: { total_cost_usd: 0.23 },
      context_window: {
        used_percentage: 42,
        context_window_size: 200000,
        current_usage: { input_tokens: 84000 },
      },
    };

    // Create fresh cache entry
    const dailyEntry: DailyTotalEntry = {
      cost_usd: 1.50,
      date: new Date().toISOString().slice(0, 10),
      updated_at: Date.now(),
    };
    writeFileSync(join(testCacheDir, 'daily-total.json'), JSON.stringify(dailyEntry));

    const result = generateStatuslineWithExtended(input, testCacheDir);
    expect(stripAnsi(result)).toBe('🤖 Opus | 💰 $0.23 sess / $1.50 today | 🧠 84k/200k [███░░░░░] 42%');
  });

  it('includes burn rate segment when cache has fresh burn-rate.json', () => {
    const input: ClaudeCodeInput = {
      model: { display_name: 'Claude Opus 4.5' },
      cost: { total_cost_usd: 0.23 },
      context_window: {
        used_percentage: 42,
        context_window_size: 200000,
        current_usage: { input_tokens: 84000 },
      },
    };

    // Create fresh cache entry
    const burnEntry: BurnRateEntry = {
      rate_per_hour: 0.12,
      updated_at: Date.now(),
    };
    writeFileSync(join(testCacheDir, 'burn-rate.json'), JSON.stringify(burnEntry));

    const result = generateStatuslineWithExtended(input, testCacheDir);
    expect(stripAnsi(result)).toBe('🤖 Opus | 💰 $0.23 sess | 🔥 $0.12/hr | 🧠 84k/200k [███░░░░░] 42%');
  });

  it('includes block info in cost segment when cache has fresh block-info.json', () => {
    const input: ClaudeCodeInput = {
      model: { display_name: 'Claude Opus 4.5' },
      cost: { total_cost_usd: 0.23 },
      context_window: {
        used_percentage: 42,
        context_window_size: 200000,
        current_usage: { input_tokens: 84000 },
      },
    };

    // Create fresh cache entries
    const blockEntry: BlockInfoEntry = {
      cost_usd: 0.45,
      remaining_seconds: 9900, // 2h 45m
      updated_at: Date.now(),
    };
    writeFileSync(join(testCacheDir, 'block-info.json'), JSON.stringify(blockEntry));

    const result = generateStatuslineWithExtended(input, testCacheDir);
    expect(stripAnsi(result)).toBe('🤖 Opus | 💰 $0.23 sess / $0.45 (2h 45m left) | 🧠 84k/200k [███░░░░░] 42%');
  });

  it('formats full output with all cache entries', () => {
    const input: ClaudeCodeInput = {
      model: { display_name: 'Claude Opus 4.5' },
      cost: { total_cost_usd: 0.23 },
      context_window: {
        used_percentage: 12,
        context_window_size: 200000,
        current_usage: { input_tokens: 25000 },
      },
    };

    // Create all cache entries
    const dailyEntry: DailyTotalEntry = {
      cost_usd: 1.23,
      date: new Date().toISOString().slice(0, 10),
      updated_at: Date.now(),
    };
    writeFileSync(join(testCacheDir, 'daily-total.json'), JSON.stringify(dailyEntry));

    const blockEntry: BlockInfoEntry = {
      cost_usd: 0.45,
      remaining_seconds: 9900, // 2h 45m
      updated_at: Date.now(),
    };
    writeFileSync(join(testCacheDir, 'block-info.json'), JSON.stringify(blockEntry));

    const burnEntry: BurnRateEntry = {
      rate_per_hour: 0.12,
      updated_at: Date.now(),
    };
    writeFileSync(join(testCacheDir, 'burn-rate.json'), JSON.stringify(burnEntry));

    const result = generateStatuslineWithExtended(input, testCacheDir);
    expect(stripAnsi(result)).toBe('🤖 Opus | 💰 $0.23 sess / $1.23 today / $0.45 (2h 45m left) | 🔥 $0.12/hr | 🧠 25k/200k [█░░░░░░░] 12%');
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
    expect(stripAnsi(result)).toBe('🤖 Opus');
  });

  it('is an alias for generateStatusline', () => {
    expect(generateStatuslineWithExtended).toBe(generateStatusline);
  });
});
