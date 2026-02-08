import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  generateStatusline,
  FALLBACK_OUTPUT,
  generateStatuslineWithExtended,
  normalizeSegmentId,
  parseSegmentList,
  resolveSegmentOrder,
  resolveRenderOptions,
  DEFAULT_SEGMENT_ORDER,
  getCacheTargetsForSegments,
  getCacheTargetTtlSeconds,
  shouldRequestBgCacheUpdate,
} from './statusline.js';
import type { ClaudeCodeInput } from '../types/claude-code.js';
import type { SubscriptionUsageEntry } from '../types/cache.js';
import type { PluginConfig } from '../types/plugin.js';
import { stripAnsi } from '../utils/colors.js';

const CANONICAL_FULL_LINE =
  '🤖 Opus | 💰 $0.23 | ⌛️ 55% [████░░░░] (~3:45pm) | 🧠 25,000 [█░░░░░░░] (12%)';

describe('canonical full example line', () => {
  it('is a single line with intact context segment', () => {
    expect(CANONICAL_FULL_LINE).not.toContain('\n');
    expect(CANONICAL_FULL_LINE).not.toContain('\r');
    expect(CANONICAL_FULL_LINE).toContain(' | ');
    expect(CANONICAL_FULL_LINE).toContain('🧠 25,000 [█░░░░░░░] (12%)');
  });
});

describe('generateStatusline', () => {
  const testCacheDir = join(tmpdir(), `cc-statusline-custom-test-${String(process.pid)}`);

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
      const input: ClaudeCodeInput = { model: 'Claude Opus 4.5' };
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
      expect(stripAnsi(result)).toBe('🤖 Opus | 💰 $0.23 | ⌛️ Loading... | 🧠 84,000 [███░░░░░] (42%)');
      expect(stripAnsi(result)).not.toContain('🔥');
      expect(stripAnsi(result)).not.toContain('left)');
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
      expect(stripAnsi(result)).toBe('🤖 Sonnet | 💰 $1.50 | ⌛️ Loading... | 🧠 150,000 [██████░░] (75%)');
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
      expect(stripAnsi(result)).toBe('🤖 Opus | 💰 $0.05 | ⌛️ Loading... | 🧠 20,000 [█░░░░░░░] (10%)');
    });

    it('omits missing metrics gracefully', () => {
      const modelOnly: ClaudeCodeInput = {
        model: { display_name: 'Claude Haiku' },
      };
      expect(stripAnsi(generateStatusline(modelOnly, testCacheDir))).toBe('🤖 Haiku | ⌛️ Loading... | 🧠 0 [░░░░░░░░] (0%)');

      const modelAndCost: ClaudeCodeInput = {
        model: { display_name: 'Claude Haiku' },
        cost: { total_cost_usd: 0.01 },
      };
      expect(stripAnsi(generateStatusline(modelAndCost, testCacheDir))).toBe('🤖 Haiku | 💰 $0.01 | ⌛️ Loading... | 🧠 0 [░░░░░░░░] (0%)');

      const modelAndContext: ClaudeCodeInput = {
        model: { display_name: 'Claude Haiku' },
        context_window: {
          used_percentage: 5,
          context_window_size: 200000,
          current_usage: { input_tokens: 10000 },
        },
      };
      expect(stripAnsi(generateStatusline(modelAndContext, testCacheDir))).toBe('🤖 Haiku | ⌛️ Loading... | 🧠 10,000 [░░░░░░░░] (5%)');
    });

    it('returns context placeholder for empty object', () => {
      expect(stripAnsi(generateStatusline({}, testCacheDir))).toBe('🧠 0 [░░░░░░░░] (0%)');
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
      expect(stripAnsi(result)).toBe('🤖 Opus | ⌛️ Loading... | 🧠 0 [░░░░░░░░] (0%)');
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
  const testCacheDir = join(tmpdir(), `cc-statusline-custom-ext-test-${String(process.pid)}`);

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
    expect(stripAnsi(result)).toBe('🤖 Opus | 💰 $0.23 | ⌛️ Loading... | 🧠 84,000 [███░░░░░] (42%)');
    expect(stripAnsi(result)).not.toContain('🔥');
    expect(stripAnsi(result)).not.toContain('left)');
  });

  it('includes subscription usage segment when cache has fresh subscription-usage.json', () => {
    const originalTz = process.env.TZ;
    process.env.TZ = 'UTC';

    try {
      const input: ClaudeCodeInput = {
        model: { display_name: 'Claude Opus 4.5' },
        cost: { total_cost_usd: 0.23 },
        context_window: {
          used_percentage: 42,
          context_window_size: 200000,
          current_usage: { input_tokens: 84000 },
        },
      };

      const subscriptionUsage: SubscriptionUsageEntry = {
        utilizationPercent: 55,
        resetsAt: '2026-01-20T15:45:00Z',
        updatedAt: '2026-01-20T10:00:00Z',
        lastError: null,
        lastAttemptAt: '2026-01-20T10:00:00Z',
      };
      writeFileSync(join(testCacheDir, 'subscription-usage.json'), JSON.stringify(subscriptionUsage));

      const result = generateStatuslineWithExtended(input, testCacheDir);
      expect(stripAnsi(result)).toBe(
        '🤖 Opus | 💰 $0.23 | ⌛️ 55% [████░░░░] (~3:45pm) | 🧠 84,000 [███░░░░░] (42%)'
      );
    } finally {
      if (originalTz === undefined) {
        delete process.env.TZ;
      } else {
        process.env.TZ = originalTz;
      }
    }
  });

  it('uses seven_days emoji when subscription usage window is seven_days', () => {
    const originalTz = process.env.TZ;
    process.env.TZ = 'UTC';

    try {
      const input: ClaudeCodeInput = {
        model: { display_name: 'Claude Opus 4.5' },
        cost: { total_cost_usd: 0.23 },
        context_window: {
          used_percentage: 42,
          context_window_size: 200000,
          current_usage: { input_tokens: 84000 },
        },
      };

      const subscriptionUsage: SubscriptionUsageEntry = {
        utilizationPercent: 55,
        resetsAt: '2026-02-01T22:45:00Z',
        updatedAt: '2026-01-20T10:00:00Z',
        lastError: null,
        lastAttemptAt: '2026-01-20T10:00:00Z',
        window: 'seven_days',
      };
      writeFileSync(join(testCacheDir, 'subscription-usage.json'), JSON.stringify(subscriptionUsage));

      const result = generateStatuslineWithExtended(input, testCacheDir);
      expect(stripAnsi(result)).toBe(
        '🤖 Opus | 💰 $0.23 | 🌙 55% [████░░░░] (~10:45pm, Feb 1) | 🧠 84,000 [███░░░░░] (42%)'
      );
    } finally {
      if (originalTz === undefined) {
        delete process.env.TZ;
      } else {
        process.env.TZ = originalTz;
      }
    }
  });

  it('rounds subscription reset times when minutes are 59', () => {
    const originalTz = process.env.TZ;
    process.env.TZ = 'UTC';

    try {
      const input: ClaudeCodeInput = {
        model: { display_name: 'Claude Opus 4.5' },
        cost: { total_cost_usd: 0.23 },
        context_window: {
          used_percentage: 42,
          context_window_size: 200000,
          current_usage: { input_tokens: 84000 },
        },
      };

      const subscriptionUsage: SubscriptionUsageEntry = {
        utilizationPercent: 55,
        resetsAt: '2026-01-20T02:59:00Z',
        updatedAt: '2026-01-20T10:00:00Z',
        lastError: null,
        lastAttemptAt: '2026-01-20T10:00:00Z',
      };
      writeFileSync(join(testCacheDir, 'subscription-usage.json'), JSON.stringify(subscriptionUsage));

      const result = generateStatuslineWithExtended(input, testCacheDir);
      expect(stripAnsi(result)).toBe(
        '🤖 Opus | 💰 $0.23 | ⌛️ 55% [████░░░░] (~3am) | 🧠 84,000 [███░░░░░] (42%)'
      );
    } finally {
      if (originalTz === undefined) {
        delete process.env.TZ;
      } else {
        process.env.TZ = originalTz;
      }
    }
  });

  it('shows fetch error when cache is invalid and lastAttemptAt is recent', () => {
    const input: ClaudeCodeInput = {
      model: { display_name: 'Claude Opus 4.5' },
      context_window: {
        used_percentage: 42,
        context_window_size: 200000,
        current_usage: { input_tokens: 84000 },
      },
    };

    const nowIso = new Date().toISOString();
    const subscriptionUsage: SubscriptionUsageEntry = {
      lastError: 'oauth_fetch_failed',
      lastAttemptAt: nowIso,
      updatedAt: nowIso,
    };
    writeFileSync(join(testCacheDir, 'subscription-usage.json'), JSON.stringify(subscriptionUsage));

    const result = generateStatuslineWithExtended(input, testCacheDir);
    expect(stripAnsi(result)).toBe('🤖 Opus | ⌛️ Fetch Error... | 🧠 84,000 [███░░░░░] (42%)');
  });

  it('shows fetch error detail when debug is enabled', () => {
    const input: ClaudeCodeInput = {
      model: { display_name: 'Claude Opus 4.5' },
      context_window: {
        used_percentage: 42,
        context_window_size: 200000,
        current_usage: { input_tokens: 84000 },
      },
    };

    const nowIso = new Date().toISOString();
    const subscriptionUsage: SubscriptionUsageEntry = {
      lastError: 'oauth_fetch_failed',
      lastAttemptAt: nowIso,
      updatedAt: nowIso,
    };
    writeFileSync(join(testCacheDir, 'subscription-usage.json'), JSON.stringify(subscriptionUsage));

    const result = generateStatuslineWithExtended(input, testCacheDir, undefined, undefined, true);
    expect(stripAnsi(result)).toBe('🤖 Opus | ⌛️ Fetch Error (oauth_fetch_failed) | 🧠 84,000 [███░░░░░] (42%)');
  });

  it('shows fetch error when resetsAt is invalid', () => {
    const input: ClaudeCodeInput = {
      model: { display_name: 'Claude Opus 4.5' },
      context_window: {
        used_percentage: 42,
        context_window_size: 200000,
        current_usage: { input_tokens: 84000 },
      },
    };

    const nowIso = new Date().toISOString();
    const subscriptionUsage: SubscriptionUsageEntry = {
      utilizationPercent: 55,
      resetsAt: 'invalid-date',
      updatedAt: nowIso,
      lastAttemptAt: nowIso,
      lastError: 'oauth_fetch_failed',
      window: 'five_hours',
    };
    writeFileSync(join(testCacheDir, 'subscription-usage.json'), JSON.stringify(subscriptionUsage));

    const result = generateStatuslineWithExtended(input, testCacheDir);
    expect(stripAnsi(result)).toBe('🤖 Opus | ⌛️ Fetch Error... | 🧠 84,000 [███░░░░░] (42%)');
  });

  it('shows fetch error when resetsAt is not a string', () => {
    const input: ClaudeCodeInput = {
      model: { display_name: 'Claude Opus 4.5' },
      context_window: {
        used_percentage: 42,
        context_window_size: 200000,
        current_usage: { input_tokens: 84000 },
      },
    };

    const nowIso = new Date().toISOString();
    const subscriptionUsage = {
      utilizationPercent: 55,
      resetsAt: 12345,
      updatedAt: nowIso,
      lastAttemptAt: nowIso,
      lastError: 'oauth_fetch_failed',
      window: 'five_hours',
    };
    writeFileSync(join(testCacheDir, 'subscription-usage.json'), JSON.stringify(subscriptionUsage));

    const result = generateStatuslineWithExtended(input, testCacheDir);
    expect(stripAnsi(result)).toBe('🤖 Opus | ⌛️ Fetch Error... | 🧠 84,000 [███░░░░░] (42%)');
  });

  it('shows fetch error when utilizationPercent is out of range', () => {
    const input: ClaudeCodeInput = {
      model: { display_name: 'Claude Opus 4.5' },
      context_window: {
        used_percentage: 42,
        context_window_size: 200000,
        current_usage: { input_tokens: 84000 },
      },
    };

    const nowIso = new Date().toISOString();
    const subscriptionUsage: SubscriptionUsageEntry = {
      utilizationPercent: 101,
      resetsAt: '2026-01-20T15:45:00Z',
      updatedAt: nowIso,
      lastAttemptAt: nowIso,
      lastError: 'oauth_fetch_failed',
      window: 'five_hours',
    };
    writeFileSync(join(testCacheDir, 'subscription-usage.json'), JSON.stringify(subscriptionUsage));

    const result = generateStatuslineWithExtended(input, testCacheDir);
    expect(stripAnsi(result)).toBe('🤖 Opus | ⌛️ Fetch Error... | 🧠 84,000 [███░░░░░] (42%)');
  });

  it('uses seven_days label for fetch error when window is seven_days', () => {
    const input: ClaudeCodeInput = {
      model: { display_name: 'Claude Opus 4.5' },
      context_window: {
        used_percentage: 42,
        context_window_size: 200000,
        current_usage: { input_tokens: 84000 },
      },
    };

    const nowIso = new Date().toISOString();
    const subscriptionUsage: SubscriptionUsageEntry = {
      lastError: 'oauth_fetch_failed',
      lastAttemptAt: nowIso,
      updatedAt: nowIso,
      window: 'seven_days',
    };
    writeFileSync(join(testCacheDir, 'subscription-usage.json'), JSON.stringify(subscriptionUsage));

    const result = generateStatuslineWithExtended(input, testCacheDir);
    expect(stripAnsi(result)).toBe('🤖 Opus | 🌙 Fetch Error... | 🧠 84,000 [███░░░░░] (42%)');
  });

  it('uses seven_days label for loading when window is seven_days', () => {
    const input: ClaudeCodeInput = {
      model: { display_name: 'Claude Opus 4.5' },
      context_window: {
        used_percentage: 42,
        context_window_size: 200000,
        current_usage: { input_tokens: 84000 },
      },
    };

    const nowIso = new Date().toISOString();
    const subscriptionUsage: SubscriptionUsageEntry = {
      lastError: null,
      updatedAt: nowIso,
      window: 'seven_days',
    };
    writeFileSync(join(testCacheDir, 'subscription-usage.json'), JSON.stringify(subscriptionUsage));

    const result = generateStatuslineWithExtended(input, testCacheDir);
    expect(stripAnsi(result)).toBe('🤖 Opus | 🌙 Loading... | 🧠 84,000 [███░░░░░] (42%)');
  });

  it('formats full output with subscription usage cache', () => {
    const originalTz = process.env.TZ;
    process.env.TZ = 'UTC';

    const input: ClaudeCodeInput = {
      model: { display_name: 'Claude Opus 4.5' },
      cost: { total_cost_usd: 0.23 },
      context_window: {
        used_percentage: 12,
        context_window_size: 200000,
        current_usage: { input_tokens: 25000 },
      },
    };

    try {
      const subscriptionUsage: SubscriptionUsageEntry = {
        utilizationPercent: 55,
        resetsAt: '2026-01-20T15:45:00Z',
        updatedAt: '2026-01-20T10:00:00Z',
        lastError: null,
        lastAttemptAt: '2026-01-20T10:00:00Z',
      };
      writeFileSync(join(testCacheDir, 'subscription-usage.json'), JSON.stringify(subscriptionUsage));

      const result = generateStatuslineWithExtended(input, testCacheDir);
      expect(stripAnsi(result)).toBe(CANONICAL_FULL_LINE);
      expect(stripAnsi(result)).not.toContain('🔥');
      expect(stripAnsi(result)).not.toContain('left)');
    } finally {
      if (originalTz === undefined) {
        delete process.env.TZ;
      } else {
        process.env.TZ = originalTz;
      }
    }
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
    writeFileSync(join(testCacheDir, 'subscription-usage.json'), 'not valid json');

    const result = generateStatuslineWithExtended(input, testCacheDir);
    expect(stripAnsi(result)).toBe('🤖 Opus | ⌛️ Loading... | 🧠 0 [░░░░░░░░] (0%)');
  });

  it('is an alias for generateStatusline', () => {
    expect(generateStatuslineWithExtended).toBe(generateStatusline);
  });
});

describe('segment configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('DEFAULT_SEGMENT_ORDER', () => {
    it('has the expected default order', () => {
      expect(DEFAULT_SEGMENT_ORDER).toEqual([
        'model',
        'cost_session',
        'subscription_usage',
        'context',
      ]);
    });
  });

  describe('normalizeSegmentId', () => {
    it('passes through canonical identifiers unchanged', () => {
      expect(normalizeSegmentId('model')).toBe('model');
      expect(normalizeSegmentId('cost_session')).toBe('cost_session');
      expect(normalizeSegmentId('context')).toBe('context');
      expect(normalizeSegmentId('subscription_usage')).toBe('subscription_usage');
    });

    it('normalizes cost alias to cost_session', () => {
      expect(normalizeSegmentId('cost')).toBe('cost_session');
    });

    it('normalizes cost_usd alias to cost_session', () => {
      expect(normalizeSegmentId('cost_usd')).toBe('cost_session');
    });

    it('normalizes cost_sess alias to cost_session', () => {
      expect(normalizeSegmentId('cost_sess')).toBe('cost_session');
    });

    it('normalizes sess alias to cost_session', () => {
      expect(normalizeSegmentId('sess')).toBe('cost_session');
    });

    it('normalizes ctx alias to context', () => {
      expect(normalizeSegmentId('ctx')).toBe('context');
    });

    it('normalizes usage alias to subscription_usage', () => {
      expect(normalizeSegmentId('usage')).toBe('subscription_usage');
    });

    it('normalizes subscription alias to subscription_usage', () => {
      expect(normalizeSegmentId('subscription')).toBe('subscription_usage');
    });

    it('normalizes sub_usage alias to subscription_usage', () => {
      expect(normalizeSegmentId('sub_usage')).toBe('subscription_usage');
    });

    it('normalizes sub alias to subscription_usage', () => {
      expect(normalizeSegmentId('sub')).toBe('subscription_usage');
    });

    it('returns null for unknown identifiers', () => {
      expect(normalizeSegmentId('unknown')).toBeNull();
      expect(normalizeSegmentId('invalid')).toBeNull();
      expect(normalizeSegmentId('')).toBeNull();
    });

    it('is case-insensitive', () => {
      expect(normalizeSegmentId('MODEL')).toBe('model');
      expect(normalizeSegmentId('Cost_Session')).toBe('cost_session');
      expect(normalizeSegmentId('CONTEXT')).toBe('context');
      expect(normalizeSegmentId('CTX')).toBe('context');
      expect(normalizeSegmentId('SUB')).toBe('subscription_usage');
    });

    it('trims whitespace', () => {
      expect(normalizeSegmentId('  model  ')).toBe('model');
      expect(normalizeSegmentId('\tcontext\n')).toBe('context');
    });
  });

  describe('parseSegmentList', () => {
    it('parses comma-separated canonical identifiers', () => {
      const result = parseSegmentList('model,cost_session,context');
      expect(result).toEqual(['model', 'cost_session', 'context']);
    });

    it('normalizes aliases during parsing', () => {
      const result = parseSegmentList('model,cost_usd,ctx,sub');
      expect(result).toEqual(['model', 'cost_session', 'context', 'subscription_usage']);
    });

    it('ignores unknown identifiers silently', () => {
      const result = parseSegmentList('model,unknown,context,invalid');
      expect(result).toEqual(['model', 'context']);
    });

    it('removes duplicates (keeps first occurrence)', () => {
      const result = parseSegmentList('model,cost_session,model,context');
      expect(result).toEqual(['model', 'cost_session', 'context']);
    });

    it('handles aliases resolving to same canonical (dedup)', () => {
      const result = parseSegmentList('cost_usd,cost_session,sess');
      expect(result).toEqual(['cost_session']);
    });

    it('returns empty array for all-unknown input', () => {
      const result = parseSegmentList('unknown,invalid,foo');
      expect(result).toEqual([]);
    });

    it('returns empty array for empty string', () => {
      const result = parseSegmentList('');
      expect(result).toEqual([]);
    });

    it('handles whitespace around identifiers', () => {
      const result = parseSegmentList('  model , context , sub  ');
      expect(result).toEqual(['model', 'context', 'subscription_usage']);
    });

    it('handles only whitespace', () => {
      const result = parseSegmentList('   ');
      expect(result).toEqual([]);
    });
  });

  describe('resolveSegmentOrder', () => {
    it('should use CLI value when provided', () => {
      delete process.env.CCSTATUSLINE_SEGMENTS;
      const result = resolveSegmentOrder('model,context');
      expect(result).toEqual(['model', 'context']);
    });

    it('should use env value when CLI is undefined', () => {
      process.env.CCSTATUSLINE_SEGMENTS = 'context,model';
      const result = resolveSegmentOrder(undefined);
      expect(result).toEqual(['context', 'model']);
    });

    it('should use CLI when both CLI and env are set', () => {
      process.env.CCSTATUSLINE_SEGMENTS = 'context,model';
      const result = resolveSegmentOrder('model,cost_session');
      expect(result).toEqual(['model', 'cost_session']);
    });

    it('should use default when both CLI and env are absent', () => {
      delete process.env.CCSTATUSLINE_SEGMENTS;
      const result = resolveSegmentOrder(undefined);
      expect(result).toEqual(DEFAULT_SEGMENT_ORDER);
    });

    it('should use default when CLI is empty string', () => {
      delete process.env.CCSTATUSLINE_SEGMENTS;
      const result = resolveSegmentOrder('');
      expect(result).toEqual(DEFAULT_SEGMENT_ORDER);
    });

    it('should use default when env is empty string', () => {
      process.env.CCSTATUSLINE_SEGMENTS = '';
      const result = resolveSegmentOrder(undefined);
      expect(result).toEqual(DEFAULT_SEGMENT_ORDER);
    });

    it('should use default when CLI has all unknown identifiers', () => {
      delete process.env.CCSTATUSLINE_SEGMENTS;
      const result = resolveSegmentOrder('unknown,invalid');
      expect(result).toEqual(DEFAULT_SEGMENT_ORDER);
    });

    it('should use default when env has all unknown identifiers', () => {
      process.env.CCSTATUSLINE_SEGMENTS = 'unknown,invalid';
      const result = resolveSegmentOrder(undefined);
      expect(result).toEqual(DEFAULT_SEGMENT_ORDER);
    });

    it('should accept explicit env parameter', () => {
      delete process.env.CCSTATUSLINE_SEGMENTS;
      const result = resolveSegmentOrder(undefined, 'context,model');
      expect(result).toEqual(['context', 'model']);
    });

    it('should not fall back to env when CLI is empty string', () => {
      process.env.CCSTATUSLINE_SEGMENTS = 'context,model';
      const result = resolveSegmentOrder('');
      expect(result).toEqual(DEFAULT_SEGMENT_ORDER);
    });

    it('should not fall back to env when CLI has all unknown identifiers', () => {
      process.env.CCSTATUSLINE_SEGMENTS = 'context,model';
      const result = resolveSegmentOrder('unknown,invalid');
      expect(result).toEqual(DEFAULT_SEGMENT_ORDER);
    });

    it('should not fall back to env when CLI is whitespace-only', () => {
      process.env.CCSTATUSLINE_SEGMENTS = 'context,model';
      const result = resolveSegmentOrder('   ');
      expect(result).toEqual(DEFAULT_SEGMENT_ORDER);
    });
  });

  describe('getCacheTargetsForSegments', () => {
    it('returns empty array when segments do not require cache', () => {
      const result = getCacheTargetsForSegments(['model', 'context']);
      expect(result).toEqual([]);
    });

    it('returns subscriptionUsage when subscription_usage segment is included', () => {
      const result = getCacheTargetsForSegments(['subscription_usage']);
      expect(result).toEqual(['subscriptionUsage']);
    });

    it('returns subscriptionUsage when mixed with non-cache segments', () => {
      const result = getCacheTargetsForSegments(['model', 'subscription_usage', 'context']);
      expect(result).toEqual(['subscriptionUsage']);
    });

    it('returns empty array for cost_session segment', () => {
      const result = getCacheTargetsForSegments(['cost_session']);
      expect(result).toEqual([]);
    });

    it('deduplicates when same segment appears multiple times', () => {
      const result = getCacheTargetsForSegments(['subscription_usage', 'model', 'subscription_usage']);
      expect(result).toEqual(['subscriptionUsage']);
    });

    it('returns empty array for empty segment list', () => {
      const result = getCacheTargetsForSegments([]);
      expect(result).toEqual([]);
    });
  });

  describe('getCacheTargetTtlSeconds', () => {
    it('returns configured TTL for subscriptionUsage', () => {
      delete process.env.CCSTATUSLINE_SUBSCRIPTION_CACHE_TTL;
      const result = getCacheTargetTtlSeconds('subscriptionUsage');
      expect(result).toBe(60); // Default TTL
    });

    it('respects environment variable override for subscriptionUsage', () => {
      process.env.CCSTATUSLINE_SUBSCRIPTION_CACHE_TTL = '120';
      const result = getCacheTargetTtlSeconds('subscriptionUsage');
      expect(result).toBe(120);
    });

    it('returns positive integer for subscriptionUsage', () => {
      const result = getCacheTargetTtlSeconds('subscriptionUsage');
      expect(result).toBeGreaterThan(0);
      expect(Number.isInteger(result)).toBe(true);
    });
  });

  describe('shouldRequestBgCacheUpdate', () => {
    const testCacheDir = join(tmpdir(), `cc-statusline-custom-bgupdate-test-${String(process.pid)}`);

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

    it('returns false when segments do not require cache', () => {
      const result = shouldRequestBgCacheUpdate(testCacheDir, ['model', 'context']);
      expect(result).toBe(false);
    });

    it('returns true when cache is missing', () => {
      const result = shouldRequestBgCacheUpdate(testCacheDir, ['subscription_usage']);
      expect(result).toBe(true);
    });

    it('returns true when cache is expired', () => {
      // Create cache file that's older than TTL
      const cacheFile = join(testCacheDir, 'subscription-usage.json');
      const oldEntry: SubscriptionUsageEntry = {
        utilizationPercent: 50,
        resetsAt: '2026-01-20T15:45:00Z',
        lastError: null,
        lastAttemptAt: new Date(Date.now() - 120 * 1000).toISOString(), // 120 seconds ago
        updatedAt: new Date(Date.now() - 120 * 1000).toISOString(),
      };
      writeFileSync(cacheFile, JSON.stringify(oldEntry));

      // Set file mtime to 120 seconds ago to make it appear old
      const oldTime = Date.now() / 1000 - 120;
      utimesSync(cacheFile, oldTime, oldTime);

      // Set TTL to 60 seconds, so cache is expired
      process.env.CCSTATUSLINE_SUBSCRIPTION_CACHE_TTL = '60';
      const result = shouldRequestBgCacheUpdate(testCacheDir, ['subscription_usage']);
      expect(result).toBe(true);
    });

    it('returns true when cache has error/invalid payload', () => {
      const cacheFile = join(testCacheDir, 'subscription-usage.json');
      const errorEntry: SubscriptionUsageEntry = {
        lastError: 'oauth_fetch_failed',
        lastAttemptAt: new Date(Date.now() - 60 * 1000).toISOString(), // 60 seconds ago (beyond cooldown)
        updatedAt: new Date(Date.now() - 60 * 1000).toISOString(),
      };
      writeFileSync(cacheFile, JSON.stringify(errorEntry));

      const result = shouldRequestBgCacheUpdate(testCacheDir, ['subscription_usage']);
      expect(result).toBe(true);
    });

    it('returns false when within cooldown', () => {
      const cacheFile = join(testCacheDir, 'subscription-usage.json');
      const nowMs = Date.now();
      const recentEntry: SubscriptionUsageEntry = {
        utilizationPercent: 50,
        resetsAt: '2026-01-20T15:45:00Z',
        lastError: null,
        lastAttemptAt: new Date(nowMs - 10 * 1000).toISOString(), // 10 seconds ago
        updatedAt: new Date(nowMs - 10 * 1000).toISOString(),
      };
      writeFileSync(cacheFile, JSON.stringify(recentEntry));

      // Cooldown is 30 seconds by default, so should not update
      const result = shouldRequestBgCacheUpdate(testCacheDir, ['subscription_usage'], {
        nowMs,
        cooldownSeconds: 30,
      });
      expect(result).toBe(false);
    });

    it('returns false when cache is fresh and valid', () => {
      const cacheFile = join(testCacheDir, 'subscription-usage.json');
      const freshEntry: SubscriptionUsageEntry = {
        utilizationPercent: 50,
        resetsAt: '2026-01-20T15:45:00Z',
        lastError: null,
        lastAttemptAt: new Date(Date.now() - 10 * 1000).toISOString(),
        updatedAt: new Date(Date.now() - 10 * 1000).toISOString(),
      };
      writeFileSync(cacheFile, JSON.stringify(freshEntry));

      process.env.CCSTATUSLINE_SUBSCRIPTION_CACHE_TTL = '60';
      const result = shouldRequestBgCacheUpdate(testCacheDir, ['subscription_usage']);
      expect(result).toBe(false);
    });

    it('returns true when beyond cooldown period', () => {
      const cacheFile = join(testCacheDir, 'subscription-usage.json');
      const nowMs = Date.now();
      const oldAttemptEntry: SubscriptionUsageEntry = {
        lastError: 'oauth_fetch_failed',
        lastAttemptAt: new Date(nowMs - 60 * 1000).toISOString(), // 60 seconds ago
        updatedAt: new Date(nowMs - 60 * 1000).toISOString(),
      };
      writeFileSync(cacheFile, JSON.stringify(oldAttemptEntry));

      // Cooldown is 30 seconds, last attempt was 60 seconds ago => should update
      const result = shouldRequestBgCacheUpdate(testCacheDir, ['subscription_usage'], {
        nowMs,
        cooldownSeconds: 30,
      });
      expect(result).toBe(true);
    });

    it('returns false for empty segment list', () => {
      const result = shouldRequestBgCacheUpdate(testCacheDir, []);
      expect(result).toBe(false);
    });

    it('handles missing lastAttemptAt gracefully', () => {
      const cacheFile = join(testCacheDir, 'subscription-usage.json');
      const entryWithoutAttempt: SubscriptionUsageEntry = {
        utilizationPercent: 50,
        resetsAt: '2026-01-20T15:45:00Z',
        lastError: null,
        updatedAt: new Date(Date.now() - 10 * 1000).toISOString(),
      };
      writeFileSync(cacheFile, JSON.stringify(entryWithoutAttempt));

      process.env.CCSTATUSLINE_SUBSCRIPTION_CACHE_TTL = '60';
      const result = shouldRequestBgCacheUpdate(testCacheDir, ['subscription_usage']);
      // Fresh and valid => should not update
      expect(result).toBe(false);
    });

    it('returns false when lock file is fresh (update in progress)', () => {
      const lockFile = join(testCacheDir, 'cache.lock');
      writeFileSync(lockFile, String(process.pid));

      // Ensure lock freshness is deterministic
      const now = new Date();
      utimesSync(lockFile, now, now);

      const result = shouldRequestBgCacheUpdate(testCacheDir, ['subscription_usage']);
      expect(result).toBe(false);
    });

    /** Creates a minimal PluginConfig for testing. */
    function makePlugin(id: string, ttl = 60): PluginConfig {
      return { id, command: `echo "${id}"`, ttl };
    }

    /** Writes a fresh plugin cache file under <cacheDir>/plugins/<pluginId>.json. */
    function writeFreshPluginCache(pluginId: string, value = 'output'): void {
      const pluginsCacheDir = join(testCacheDir, 'plugins');
      mkdirSync(pluginsCacheDir, { recursive: true });
      writeFileSync(join(pluginsCacheDir, `${pluginId}.json`), JSON.stringify({
        value,
        updatedAt: new Date().toISOString(),
        error: null,
      }));
    }

    it('returns true when only plugin segments are present and plugin cache is stale', () => {
      // No plugin cache exists, so it's stale
      const result = shouldRequestBgCacheUpdate(testCacheDir, ['model', ':test-plugin'], {
        plugins: [makePlugin('test-plugin')],
      });
      expect(result).toBe(true);
    });

    it('returns true when subscription cache is fresh but plugin cache is stale', () => {
      const cacheFile = join(testCacheDir, 'subscription-usage.json');
      const freshEntry: SubscriptionUsageEntry = {
        utilizationPercent: 50,
        resetsAt: '2026-01-20T15:45:00Z',
        lastError: null,
        lastAttemptAt: new Date(Date.now() - 10 * 1000).toISOString(),
        updatedAt: new Date(Date.now() - 10 * 1000).toISOString(),
      };
      writeFileSync(cacheFile, JSON.stringify(freshEntry));

      // Plugin cache is missing (stale), subscription cache is fresh
      process.env.CCSTATUSLINE_SUBSCRIPTION_CACHE_TTL = '60';
      const result = shouldRequestBgCacheUpdate(testCacheDir, ['subscription_usage', ':test-plugin'], {
        plugins: [makePlugin('test-plugin')],
      });
      expect(result).toBe(true);
    });

    it('returns false when plugin cache is fresh (no projectDir)', () => {
      writeFreshPluginCache('test-plugin', 'test output');

      const result = shouldRequestBgCacheUpdate(testCacheDir, ['model', ':test-plugin'], {
        plugins: [makePlugin('test-plugin')],
      });
      expect(result).toBe(false);
    });

    it('returns false when all plugin caches are fresh', () => {
      writeFreshPluginCache('plugin1', 'output1');
      writeFreshPluginCache('plugin2', 'output2');

      const result = shouldRequestBgCacheUpdate(testCacheDir, ['model', ':plugin1', ':plugin2'], {
        plugins: [makePlugin('plugin1'), makePlugin('plugin2')],
      });
      expect(result).toBe(false);
    });

    it('returns true when some plugin cache is stale among multiple plugins', () => {
      writeFreshPluginCache('fresh-plugin', 'output1');

      // Write stale cache for stale-plugin (old mtime)
      const pluginsCacheDir = join(testCacheDir, 'plugins');
      mkdirSync(pluginsCacheDir, { recursive: true });
      const staleCacheFile = join(pluginsCacheDir, 'stale-plugin.json');
      writeFileSync(staleCacheFile, JSON.stringify({
        value: 'output2',
        updatedAt: new Date(Date.now() - 120 * 1000).toISOString(),
        error: null,
      }));
      const oldTime = Date.now() / 1000 - 120;
      utimesSync(staleCacheFile, oldTime, oldTime);

      const result = shouldRequestBgCacheUpdate(testCacheDir, ['model', ':fresh-plugin', ':stale-plugin'], {
        plugins: [makePlugin('fresh-plugin'), makePlugin('stale-plugin')],
      });
      expect(result).toBe(true);
    });

    it('should not trigger update for stale plugin not referenced in segments', () => {
      writeFreshPluginCache('referenced-plugin');

      // hidden-plugin has NO cache (stale), but is NOT in segments
      const result = shouldRequestBgCacheUpdate(testCacheDir, ['model', ':referenced-plugin'], {
        plugins: [makePlugin('referenced-plugin'), makePlugin('hidden-plugin')],
      });
      expect(result).toBe(false);
    });
  });
});

describe('generateStatusline with custom segment order', () => {
  const testCacheDir = join(tmpdir(), `cc-statusline-custom-order-test-${String(process.pid)}`);

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

  it('renders segments in specified order', () => {
    const input: ClaudeCodeInput = {
      model: { display_name: 'Claude Opus 4.5' },
      cost: { total_cost_usd: 0.23 },
      context_window: {
        used_percentage: 42,
        context_window_size: 200000,
        current_usage: { input_tokens: 84000 },
      },
    };

    // Reverse order: context, cost, model (no subscription)
    const result = generateStatusline(input, testCacheDir, ['context', 'cost_session', 'model']);
    expect(stripAnsi(result)).toBe('🧠 84,000 [███░░░░░] (42%) | 💰 $0.23 | 🤖 Opus');
  });

  it('renders only requested segments', () => {
    const input: ClaudeCodeInput = {
      model: { display_name: 'Claude Opus 4.5' },
      cost: { total_cost_usd: 0.23 },
      context_window: {
        used_percentage: 42,
        context_window_size: 200000,
        current_usage: { input_tokens: 84000 },
      },
    };

    // Only model and context
    const result = generateStatusline(input, testCacheDir, ['model', 'context']);
    expect(stripAnsi(result)).toBe('🤖 Opus | 🧠 84,000 [███░░░░░] (42%)');
  });

  it('shows placeholder for context when data is missing', () => {
    const input: ClaudeCodeInput = {
      model: { display_name: 'Claude Opus 4.5' },
      // No cost, no context
    };

    // Request all four - context shows placeholder, cost is skipped
    const result = generateStatusline(input, testCacheDir, ['cost_session', 'model', 'context', 'subscription_usage']);
    expect(stripAnsi(result)).toBe('🤖 Opus | 🧠 0 [░░░░░░░░] (0%) | ⌛️ Loading...');
  });

  it('uses default order when segments is undefined', () => {
    const input: ClaudeCodeInput = {
      model: { display_name: 'Claude Opus 4.5' },
      cost: { total_cost_usd: 0.23 },
    };

    const result = generateStatusline(input, testCacheDir, undefined);
    expect(stripAnsi(result)).toBe('🤖 Opus | 💰 $0.23 | ⌛️ Loading... | 🧠 0 [░░░░░░░░] (0%)');
  });

  it('returns fallback when no requested segments have data', () => {
    const input: ClaudeCodeInput = {};

    const result = generateStatusline(input, testCacheDir, ['model', 'cost_session']);
    expect(result).toBe(FALLBACK_OUTPUT);
  });

  it('subscription_usage only renders if other segments exist first', () => {
    const input: ClaudeCodeInput = {
      model: { display_name: 'Claude Opus 4.5' },
    };

    // Request subscription first, then model
    const result = generateStatusline(input, testCacheDir, ['subscription_usage', 'model']);
    // subscription_usage is skipped because no prior segments, then model is added
    expect(stripAnsi(result)).toBe('🤖 Opus');
  });

  it('renders subscription_usage when requested after other segments', () => {
    const input: ClaudeCodeInput = {
      model: { display_name: 'Claude Opus 4.5' },
    };

    // Request model first, then subscription
    const result = generateStatusline(input, testCacheDir, ['model', 'subscription_usage']);
    expect(stripAnsi(result)).toBe('🤖 Opus | ⌛️ Loading...');
  });
});

describe('resolveRenderOptions', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('emoji precedence', () => {
    it('uses CLI flag when CLI disables', () => {
      process.env.CCSTATUSLINE_NO_EMOJIS = 'false';
      const opts = resolveRenderOptions(true, undefined);
      expect(opts.showEmojis).toBe(false);
    });

    it('falls back to env when CLI undefined', () => {
      process.env.CCSTATUSLINE_NO_EMOJIS = 'true';
      const opts = resolveRenderOptions(undefined, undefined);
      expect(opts.showEmojis).toBe(false);

      process.env.CCSTATUSLINE_NO_EMOJIS = 'false';
      const opts2 = resolveRenderOptions(undefined, undefined);
      expect(opts2.showEmojis).toBe(true);
    });

    it('defaults to enabled when both undefined', () => {
      delete process.env.CCSTATUSLINE_NO_EMOJIS;
      const opts = resolveRenderOptions(undefined, undefined);
      expect(opts.showEmojis).toBe(true);
    });
  });

  describe('bars precedence', () => {
    it('uses CLI flag when CLI disables', () => {
      process.env.CCSTATUSLINE_NO_BARS = 'false';
      const opts = resolveRenderOptions(undefined, true);
      expect(opts.showBars).toBe(false);
    });

    it('falls back to env when CLI undefined', () => {
      process.env.CCSTATUSLINE_NO_BARS = 'true';
      const opts = resolveRenderOptions(undefined, undefined);
      expect(opts.showBars).toBe(false);

      process.env.CCSTATUSLINE_NO_BARS = 'false';
      const opts2 = resolveRenderOptions(undefined, undefined);
      expect(opts2.showBars).toBe(true);
    });

    it('defaults to enabled when both undefined', () => {
      delete process.env.CCSTATUSLINE_NO_BARS;
      const opts = resolveRenderOptions(undefined, undefined);
      expect(opts.showBars).toBe(true);
    });
  });

  describe('independent resolution', () => {
    it('resolves emojis and bars independently', () => {
      process.env.CCSTATUSLINE_NO_EMOJIS = 'true';
      process.env.CCSTATUSLINE_NO_BARS = 'false';
      const opts = resolveRenderOptions(undefined, true);
      expect(opts.showEmojis).toBe(false);
      expect(opts.showBars).toBe(false);
    });
  });
});

describe('extractWindowData validation (via buildSubscriptionUsageAllSegment)', () => {
  const testCacheDir = join(tmpdir(), `cc-validation-test-${String(process.pid)}`);
  const originalTz = process.env.TZ;

  beforeEach(() => {
    if (!existsSync(testCacheDir)) {
      mkdirSync(testCacheDir, { recursive: true });
    }
    process.env.TZ = 'UTC';
  });

  afterEach(() => {
    if (existsSync(testCacheDir)) {
      rmSync(testCacheDir, { recursive: true, force: true });
    }
    if (originalTz === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = originalTz;
    }
  });

  it('rejects negative utilizationPercent in fiveHours', () => {
    const cacheData: SubscriptionUsageEntry = {
      utilizationPercent: -1,
      resetsAt: '2026-01-27T15:45:00Z',
      window: 'five_hours',
      fiveHours: {
        utilizationPercent: -1,  // Invalid: negative
        resetsAt: '2026-01-27T15:45:00Z',
      },
      sevenDays: {
        utilizationPercent: 75,
        resetsAt: '2026-02-01T22:45:00Z',
      },
      lastError: null,
    };

    writeFileSync(
      join(testCacheDir, 'subscription-usage.json'),
      JSON.stringify(cacheData)
    );

    const input: ClaudeCodeInput = { model: { display_name: 'Claude Opus' } };
    const result = generateStatuslineWithExtended(input, testCacheDir, ['model', 'subscription_usage_all']);

    // Should show sevenDays only since fiveHours is invalid
    expect(result).toContain('75%');
    expect(result).toContain('(~10:45pm, Feb 1)');
  });

  it('shows fetch error when subscription_usage_all cache attempt is recent', () => {
    const nowIso = new Date().toISOString();
    const cacheData: SubscriptionUsageEntry = {
      lastError: 'oauth_fetch_failed',
      lastAttemptAt: nowIso,
      updatedAt: nowIso,
    };

    writeFileSync(
      join(testCacheDir, 'subscription-usage.json'),
      JSON.stringify(cacheData)
    );

    const input: ClaudeCodeInput = { model: { display_name: 'Claude Opus' } };
    const result = generateStatuslineWithExtended(input, testCacheDir, ['model', 'subscription_usage_all']);

    expect(stripAnsi(result)).toBe('🤖 Opus | ⌛️ Fetch Error...');
  });

  it('shows only seven_days when fiveHours window is missing', () => {
    const nowIso = new Date().toISOString();
    const cacheData: SubscriptionUsageEntry = {
      utilizationPercent: 100,
      resetsAt: '2026-02-01T14:00:00.287052+00:00',
      window: 'seven_days',
      sevenDays: {
        utilizationPercent: 100,
        resetsAt: '2026-02-01T14:00:00.287052+00:00',
      },
      lastError: null,
      lastAttemptAt: nowIso,
      updatedAt: nowIso,
    };

    writeFileSync(
      join(testCacheDir, 'subscription-usage.json'),
      JSON.stringify(cacheData)
    );

    const input: ClaudeCodeInput = { model: { display_name: 'Claude Opus' } };
    const result = generateStatuslineWithExtended(input, testCacheDir, ['model', 'subscription_usage_all']);

    expect(stripAnsi(result)).toBe('🤖 Opus | 🌙 100% [████] (~2pm, Feb 1)');
  });

  it('rejects non-integer utilizationPercent in fiveHours', () => {
    const nowIso = new Date().toISOString();
    const cacheData: SubscriptionUsageEntry = {
      utilizationPercent: 55,
      resetsAt: '2026-01-27T15:45:00Z',
      window: 'five_hours',
      fiveHours: {
        utilizationPercent: 55.5,
        resetsAt: '2026-01-27T15:45:00Z',
      },
      lastError: 'oauth_fetch_failed',
      lastAttemptAt: nowIso,
      updatedAt: nowIso,
    };

    writeFileSync(
      join(testCacheDir, 'subscription-usage.json'),
      JSON.stringify(cacheData)
    );

    const input: ClaudeCodeInput = { model: { display_name: 'Claude Opus' } };
    const result = generateStatuslineWithExtended(input, testCacheDir, ['model', 'subscription_usage_all']);

    expect(stripAnsi(result)).toBe('🤖 Opus | ⌛️ Fetch Error...');
  });

  it('shows loading when lastAttemptAt is invalid', () => {
    const cacheData: SubscriptionUsageEntry = {
      lastError: 'oauth_fetch_failed',
      lastAttemptAt: 'invalid-date',
      updatedAt: new Date().toISOString(),
    };

    writeFileSync(
      join(testCacheDir, 'subscription-usage.json'),
      JSON.stringify(cacheData)
    );

    const input: ClaudeCodeInput = { model: { display_name: 'Claude Opus' } };
    const result = generateStatuslineWithExtended(input, testCacheDir, ['model', 'subscription_usage_all']);

    expect(stripAnsi(result)).toBe('🤖 Opus | ⌛️ Loading...');
  });

  it('rejects utilizationPercent > 100 in sevenDays', () => {
    const cacheData: SubscriptionUsageEntry = {
      utilizationPercent: 101,
      resetsAt: '2026-02-01T22:45:00Z',
      window: 'seven_days',
      fiveHours: {
        utilizationPercent: 55,
        resetsAt: '2026-01-27T15:45:00Z',
      },
      sevenDays: {
        utilizationPercent: 101,  // Invalid: > 100
        resetsAt: '2026-02-01T22:45:00Z',
      },
      lastError: null,
    };

    writeFileSync(
      join(testCacheDir, 'subscription-usage.json'),
      JSON.stringify(cacheData)
    );

    const input: ClaudeCodeInput = { model: { display_name: 'Claude Opus' } };
    const result = generateStatuslineWithExtended(input, testCacheDir, ['model', 'subscription_usage_all']);

    // Should show only fiveHours since sevenDays is invalid (but fiveHours is valid)
    expect(result).toContain('55%');
    expect(result).toContain('(~3:45pm)');
    expect(result).not.toContain('101%');
  });

  it('accepts utilizationPercent = 0 (boundary)', () => {
    const cacheData: SubscriptionUsageEntry = {
      utilizationPercent: 0,
      resetsAt: '2026-01-27T15:45:00Z',
      window: 'five_hours',
      fiveHours: {
        utilizationPercent: 0,  // Valid: boundary
        resetsAt: '2026-01-27T15:45:00Z',
      },
      sevenDays: {
        utilizationPercent: 100,  // Valid: boundary
        resetsAt: '2026-02-01T22:45:00Z',
      },
      lastError: null,
    };

    writeFileSync(
      join(testCacheDir, 'subscription-usage.json'),
      JSON.stringify(cacheData)
    );

    const input: ClaudeCodeInput = { model: { display_name: 'Claude Opus' } };
    const result = generateStatuslineWithExtended(input, testCacheDir, ['model', 'subscription_usage_all']);

    // Should accept both 0 and 100
    expect(result).toContain('0%');
    expect(result).toContain('100%');
    expect(result).toContain('(~3:45pm)');
    expect(result).toContain('(~10:45pm, Feb 1)');
  });

  it('rounds minute 59 in fiveHours and sevenDays windows', () => {
    const cacheData: SubscriptionUsageEntry = {
      utilizationPercent: 55,
      resetsAt: '2026-01-27T02:59:00Z',
      window: 'five_hours',
      fiveHours: {
        utilizationPercent: 55,
        resetsAt: '2026-01-27T02:59:00Z',
      },
      sevenDays: {
        utilizationPercent: 75,
        resetsAt: '2026-02-01T22:59:00Z',
      },
      lastError: null,
    };

    writeFileSync(
      join(testCacheDir, 'subscription-usage.json'),
      JSON.stringify(cacheData)
    );

    const input: ClaudeCodeInput = { model: { display_name: 'Claude Opus' } };
    const result = generateStatuslineWithExtended(input, testCacheDir, ['model', 'subscription_usage_all']);

    expect(result).toContain('55%');
    expect(result).toContain('75%');
    expect(result).toContain('(~3am)');
    expect(result).toContain('(~11pm, Feb 1)');
  });
});

describe('subscription segments never standalone rule', () => {
  const testCacheDir = join(tmpdir(), `cc-standalone-test-${String(process.pid)}`);
  const originalTz = process.env.TZ;

  beforeEach(() => {
    if (!existsSync(testCacheDir)) {
      mkdirSync(testCacheDir, { recursive: true });
    }
    process.env.TZ = 'UTC';
  });

  afterEach(() => {
    if (existsSync(testCacheDir)) {
      rmSync(testCacheDir, { recursive: true, force: true });
    }
    if (originalTz === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = originalTz;
    }
  });

  it('suppresses subscription_usage when it would be the only segment', () => {
    const cacheData: SubscriptionUsageEntry = {
      utilizationPercent: 55,
      resetsAt: '2026-01-27T15:45:00Z',
      window: 'five_hours',
      lastError: null,
    };

    writeFileSync(
      join(testCacheDir, 'subscription-usage.json'),
      JSON.stringify(cacheData)
    );

    const input: ClaudeCodeInput = {};  // No model or other segments
    const result = generateStatuslineWithExtended(input, testCacheDir, ['subscription_usage']);

    // Should return fallback, not the subscription segment alone
    expect(result).toBe(FALLBACK_OUTPUT);
  });

  it('suppresses subscription_usage_all when it would be the only segment', () => {
    const cacheData: SubscriptionUsageEntry = {
      utilizationPercent: 55,
      resetsAt: '2026-01-27T15:45:00Z',
      window: 'five_hours',
      fiveHours: {
        utilizationPercent: 55,
        resetsAt: '2026-01-27T15:45:00Z',
      },
      sevenDays: {
        utilizationPercent: 75,
        resetsAt: '2026-02-01T22:45:00Z',
      },
      lastError: null,
    };

    writeFileSync(
      join(testCacheDir, 'subscription-usage.json'),
      JSON.stringify(cacheData)
    );

    const input: ClaudeCodeInput = {};  // No model or other segments
    const result = generateStatuslineWithExtended(input, testCacheDir, ['subscription_usage_all']);

    // Should return fallback, not the subscription segment alone
    expect(result).toBe(FALLBACK_OUTPUT);
  });

  it('allows subscription_usage when other segments are present', () => {
    const cacheData: SubscriptionUsageEntry = {
      utilizationPercent: 55,
      resetsAt: '2026-01-27T15:45:00Z',
      window: 'five_hours',
      lastError: null,
    };

    writeFileSync(
      join(testCacheDir, 'subscription-usage.json'),
      JSON.stringify(cacheData)
    );

    const input: ClaudeCodeInput = { model: { display_name: 'Claude Opus' } };
    const result = generateStatuslineWithExtended(input, testCacheDir, ['model', 'subscription_usage']);

    // Should show both model and subscription
    expect(result).toContain('Opus');
    expect(result).toContain('55%');
  });
});

describe('extra_usage display', () => {
  const testCacheDir = join(tmpdir(), `cc-extra-test-${String(process.pid)}`);
  const originalTz = process.env.TZ;

  beforeEach(() => {
    process.env.TZ = 'UTC';
    if (!existsSync(testCacheDir)) {
      mkdirSync(testCacheDir, { recursive: true });
    }
  });

  afterEach(() => {
    process.env.TZ = originalTz;
    if (existsSync(testCacheDir)) {
      rmSync(testCacheDir, { recursive: true, force: true });
    }
  });

  it('shows extra usage and five_hour when five_hour is 100% and extra_usage enabled with credits', () => {
    const cacheData: SubscriptionUsageEntry = {
      utilizationPercent: 100,
      resetsAt: '2026-02-08T15:45:00Z',
      window: 'five_hours',
      fiveHours: {
        utilizationPercent: 100,
        resetsAt: '2026-02-08T15:45:00Z',
      },
      sevenDays: {
        utilizationPercent: 85,
        resetsAt: '2026-02-08T14:00:00Z',
      },
      extraUsage: {
        isEnabled: true,
        usedCredits: 428.0,
        utilizationPercent: 8.56,
      },
      lastError: null,
    };

    writeFileSync(
      join(testCacheDir, 'subscription-usage.json'),
      JSON.stringify(cacheData)
    );

    const input: ClaudeCodeInput = { model: { display_name: 'Claude Opus' } };
    const result = stripAnsi(generateStatuslineWithExtended(input, testCacheDir, ['model', 'subscription_usage_all']));

    // Should show extra usage first, then five_hour
    expect(result).toContain('✨');
    expect(result).toContain('$4.28');
    expect(result).toContain('(8.6%)');
    expect(result).toContain('100%');
    expect(result).toContain('(~3:45pm)');
    // Extra should appear before five_hour
    const extraIndex = result.indexOf('✨');
    const fiveIndex = result.indexOf('⌛️');
    expect(extraIndex).toBeLessThan(fiveIndex);
  });

  it('shows extra usage and seven_day when seven_day is 100% (hides five_hour)', () => {
    const cacheData: SubscriptionUsageEntry = {
      utilizationPercent: 100,
      resetsAt: '2026-02-08T14:00:00Z',
      window: 'seven_days',
      fiveHours: {
        utilizationPercent: 50,
        resetsAt: '2026-02-08T15:45:00Z',
      },
      sevenDays: {
        utilizationPercent: 100,
        resetsAt: '2026-02-08T14:00:00Z',
      },
      extraUsage: {
        isEnabled: true,
        usedCredits: 428.0,
        utilizationPercent: 8.56,
      },
      lastError: null,
    };

    writeFileSync(
      join(testCacheDir, 'subscription-usage.json'),
      JSON.stringify(cacheData)
    );

    const input: ClaudeCodeInput = { model: { display_name: 'Claude Opus' } };
    const result = stripAnsi(generateStatuslineWithExtended(input, testCacheDir, ['model', 'subscription_usage_all']));

    // Should show extra usage and seven_day, NOT five_hour
    expect(result).toContain('✨');
    expect(result).toContain('$4.28');
    expect(result).toContain('🌙');
    expect(result).toContain('(~2pm, Feb 8)');
    // Should NOT show five_hour emoji
    expect(result).not.toContain('⌛️');
  });

  it('does not show extra usage when is_enabled is false', () => {
    const cacheData: SubscriptionUsageEntry = {
      utilizationPercent: 100,
      resetsAt: '2026-02-08T15:45:00Z',
      window: 'five_hours',
      fiveHours: {
        utilizationPercent: 100,
        resetsAt: '2026-02-08T15:45:00Z',
      },
      sevenDays: {
        utilizationPercent: 85,
        resetsAt: '2026-02-08T14:00:00Z',
      },
      extraUsage: {
        isEnabled: false,
        usedCredits: 0.0,
        utilizationPercent: 0.0,
      },
      lastError: null,
    };

    writeFileSync(
      join(testCacheDir, 'subscription-usage.json'),
      JSON.stringify(cacheData)
    );

    const input: ClaudeCodeInput = { model: { display_name: 'Claude Opus' } };
    const result = stripAnsi(generateStatuslineWithExtended(input, testCacheDir, ['model', 'subscription_usage_all']));

    // Should show normal display without extra usage
    expect(result).not.toContain('✨');
    expect(result).toContain('⌛️');
    expect(result).toContain('🌙');
  });

  it('does not show extra usage when used_credits is zero', () => {
    const cacheData: SubscriptionUsageEntry = {
      utilizationPercent: 100,
      resetsAt: '2026-02-08T15:45:00Z',
      window: 'five_hours',
      fiveHours: {
        utilizationPercent: 100,
        resetsAt: '2026-02-08T15:45:00Z',
      },
      sevenDays: {
        utilizationPercent: 85,
        resetsAt: '2026-02-08T14:00:00Z',
      },
      extraUsage: {
        isEnabled: true,
        usedCredits: 0.0,
        utilizationPercent: 0.0,
      },
      lastError: null,
    };

    writeFileSync(
      join(testCacheDir, 'subscription-usage.json'),
      JSON.stringify(cacheData)
    );

    const input: ClaudeCodeInput = { model: { display_name: 'Claude Opus' } };
    const result = stripAnsi(generateStatuslineWithExtended(input, testCacheDir, ['model', 'subscription_usage_all']));

    // Should show normal display without extra usage
    expect(result).not.toContain('✨');
    expect(result).toContain('⌛️');
    expect(result).toContain('🌙');
  });

  it('does not show extra usage when no window is at 100%', () => {
    const cacheData: SubscriptionUsageEntry = {
      utilizationPercent: 85,
      resetsAt: '2026-02-08T15:45:00Z',
      window: 'five_hours',
      fiveHours: {
        utilizationPercent: 85,
        resetsAt: '2026-02-08T15:45:00Z',
      },
      sevenDays: {
        utilizationPercent: 90,
        resetsAt: '2026-02-08T14:00:00Z',
      },
      extraUsage: {
        isEnabled: true,
        usedCredits: 428.0,
        utilizationPercent: 8.56,
      },
      lastError: null,
    };

    writeFileSync(
      join(testCacheDir, 'subscription-usage.json'),
      JSON.stringify(cacheData)
    );

    const input: ClaudeCodeInput = { model: { display_name: 'Claude Opus' } };
    const result = stripAnsi(generateStatuslineWithExtended(input, testCacheDir, ['model', 'subscription_usage_all']));

    // Should show normal display without extra usage
    expect(result).not.toContain('✨');
    expect(result).toContain('⌛️');
    expect(result).toContain('🌙');
  });

  it('shows normal display when extra_usage is absent from cache', () => {
    const cacheData: SubscriptionUsageEntry = {
      utilizationPercent: 100,
      resetsAt: '2026-02-08T15:45:00Z',
      window: 'five_hours',
      fiveHours: {
        utilizationPercent: 100,
        resetsAt: '2026-02-08T15:45:00Z',
      },
      sevenDays: {
        utilizationPercent: 85,
        resetsAt: '2026-02-08T14:00:00Z',
      },
      lastError: null,
    };

    writeFileSync(
      join(testCacheDir, 'subscription-usage.json'),
      JSON.stringify(cacheData)
    );

    const input: ClaudeCodeInput = { model: { display_name: 'Claude Opus' } };
    const result = stripAnsi(generateStatuslineWithExtended(input, testCacheDir, ['model', 'subscription_usage_all']));

    // Should show normal display
    expect(result).not.toContain('✨');
    expect(result).toContain('⌛️');
    expect(result).toContain('🌙');
  });

  it('works for subscription_usage segment with extra usage', () => {
    const cacheData: SubscriptionUsageEntry = {
      utilizationPercent: 100,
      resetsAt: '2026-02-08T15:45:00Z',
      window: 'five_hours',
      fiveHours: {
        utilizationPercent: 100,
        resetsAt: '2026-02-08T15:45:00Z',
      },
      extraUsage: {
        isEnabled: true,
        usedCredits: 428.0,
        utilizationPercent: 8.56,
      },
      lastError: null,
    };

    writeFileSync(
      join(testCacheDir, 'subscription-usage.json'),
      JSON.stringify(cacheData)
    );

    const input: ClaudeCodeInput = { model: { display_name: 'Claude Opus' } };
    const result = stripAnsi(generateStatuslineWithExtended(input, testCacheDir, ['model', 'subscription_usage']));

    // Should show extra usage
    expect(result).toContain('✨');
    expect(result).toContain('$4.28');
    expect(result).toContain('100%');
  });
});
