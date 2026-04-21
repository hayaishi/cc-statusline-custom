import { describe, it, expect } from 'vitest';
import {
  buildSubscriptionUsageSegment,
  buildSubscriptionUsageAllSegment,
  EMOJI_SUB_5HR,
  EMOJI_SUB_7DAY,
} from './subscription-usage.js';
import type { ClaudeCodeInput } from '../types/claude-code.js';
import type { RenderOptions } from './formatter.js';

const WITH_ALL: RenderOptions = { showEmojis: true, showBars: true };
const WITH_EMOJIS_NO_BARS: RenderOptions = { showEmojis: true, showBars: false };
const NO_EMOJIS: RenderOptions = { showEmojis: false, showBars: false };

// A well-known epoch: 2025-12-18T15:00:00Z = 1766163600
// local time depends on TZ; tests check the structure rather than exact time string
const EPOCH_5H = 1_766_084_400; // arbitrary valid value
const EPOCH_7D = 1_766_516_400; // arbitrary valid value

function makeInput(fiveHour?: { pct: number; epoch: number }, sevenDay?: { pct: number; epoch: number }): ClaudeCodeInput {
  return {
    rate_limits: {
      ...(fiveHour !== undefined && {
        five_hour: { used_percentage: fiveHour.pct, resets_at: fiveHour.epoch },
      }),
      ...(sevenDay !== undefined && {
        seven_day: { used_percentage: sevenDay.pct, resets_at: sevenDay.epoch },
      }),
    },
  };
}

describe('buildSubscriptionUsageSegment', () => {
  describe('should return empty string when rate_limits absent', () => {
    it('should return empty string when input has no rate_limits', () => {
      const input: ClaudeCodeInput = {};
      expect(buildSubscriptionUsageSegment(input, WITH_ALL)).toBe('');
    });

    it('should return empty string when five_hour window is absent', () => {
      const input = makeInput(undefined, { pct: 20, epoch: EPOCH_7D });
      expect(buildSubscriptionUsageSegment(input, WITH_ALL)).toBe('');
    });

    it('should render using rounded percent when five_hour used_percentage is fractional', () => {
      const input: ClaudeCodeInput = {
        rate_limits: { five_hour: { used_percentage: 55.5, resets_at: EPOCH_5H } },
      };
      const result = buildSubscriptionUsageSegment(input, WITH_ALL);
      expect(result).toContain('56%');
    });
  });

  describe('should format the 5-hour window correctly', () => {
    it('should include 5h emoji prefix when emojis enabled', () => {
      const input = makeInput({ pct: 55, epoch: EPOCH_5H });
      const result = buildSubscriptionUsageSegment(input, WITH_ALL);
      expect(result).toContain(EMOJI_SUB_5HR);
    });

    it('should include percentage in output', () => {
      const input = makeInput({ pct: 55, epoch: EPOCH_5H });
      const result = buildSubscriptionUsageSegment(input, WITH_ALL);
      expect(result).toContain('55%');
    });

    it('should include progress bar when showBars is true', () => {
      const input = makeInput({ pct: 55, epoch: EPOCH_5H });
      const result = buildSubscriptionUsageSegment(input, WITH_ALL);
      expect(result).toMatch(/\[[\u2588\u2591]+\]/);
    });

    it('should omit progress bar when showBars is false', () => {
      const input = makeInput({ pct: 55, epoch: EPOCH_5H });
      const result = buildSubscriptionUsageSegment(input, WITH_EMOJIS_NO_BARS);
      expect(result).not.toMatch(/\[[\u2588\u2591]+\]/);
    });

    it('should use text prefix when emojis disabled', () => {
      const input = makeInput({ pct: 55, epoch: EPOCH_5H });
      const result = buildSubscriptionUsageSegment(input, NO_EMOJIS);
      expect(result).toContain('5h: ');
      expect(result).not.toContain(EMOJI_SUB_5HR);
    });

    it('should include parenthesized reset time', () => {
      const input = makeInput({ pct: 55, epoch: EPOCH_5H });
      const result = buildSubscriptionUsageSegment(input, WITH_ALL);
      expect(result).toMatch(/\(~\d+/);
    });

    it('should handle 0% correctly', () => {
      const input = makeInput({ pct: 0, epoch: EPOCH_5H });
      const result = buildSubscriptionUsageSegment(input, WITH_ALL);
      expect(result).toContain('0%');
    });

    it('should handle 100% correctly (no extra-usage displayed)', () => {
      const input = makeInput({ pct: 100, epoch: EPOCH_5H });
      const result = buildSubscriptionUsageSegment(input, WITH_ALL);
      expect(result).toContain('100%');
    });
  });
});

describe('buildSubscriptionUsageAllSegment', () => {
  describe('should return empty string when both windows absent', () => {
    it('should return empty string when input has no rate_limits', () => {
      const input: ClaudeCodeInput = {};
      expect(buildSubscriptionUsageAllSegment(input, WITH_ALL)).toBe('');
    });

    it('should return empty string when both five_hour and seven_day are absent', () => {
      const input: ClaudeCodeInput = { rate_limits: {} };
      expect(buildSubscriptionUsageAllSegment(input, WITH_ALL)).toBe('');
    });
  });

  describe('should show only available window when one is absent', () => {
    it('should render only 5h when seven_day is absent', () => {
      const input = makeInput({ pct: 55, epoch: EPOCH_5H });
      const result = buildSubscriptionUsageAllSegment(input, WITH_ALL);
      expect(result).toContain(EMOJI_SUB_5HR);
      expect(result).not.toContain(EMOJI_SUB_7DAY);
    });

    it('should render only 7d when five_hour is absent', () => {
      const input = makeInput(undefined, { pct: 20, epoch: EPOCH_7D });
      const result = buildSubscriptionUsageAllSegment(input, WITH_ALL);
      expect(result).toContain(EMOJI_SUB_7DAY);
      expect(result).not.toContain(EMOJI_SUB_5HR);
    });
  });

  describe('should show both windows when both present', () => {
    it('should include both 5h and 7d emojis', () => {
      const input = makeInput({ pct: 55, epoch: EPOCH_5H }, { pct: 20, epoch: EPOCH_7D });
      const result = buildSubscriptionUsageAllSegment(input, WITH_ALL);
      expect(result).toContain(EMOJI_SUB_5HR);
      expect(result).toContain(EMOJI_SUB_7DAY);
    });

    it('should include both percentages', () => {
      const input = makeInput({ pct: 55, epoch: EPOCH_5H }, { pct: 20, epoch: EPOCH_7D });
      const result = buildSubscriptionUsageAllSegment(input, WITH_ALL);
      expect(result).toContain('55%');
      expect(result).toContain('20%');
    });

    it('should use text prefixes when emojis disabled', () => {
      const input = makeInput({ pct: 55, epoch: EPOCH_5H }, { pct: 20, epoch: EPOCH_7D });
      const result = buildSubscriptionUsageAllSegment(input, NO_EMOJIS);
      expect(result).toContain('5h: ');
      expect(result).toContain('7d: ');
    });

    it('should include bars for both windows when showBars is true', () => {
      const input = makeInput({ pct: 55, epoch: EPOCH_5H }, { pct: 20, epoch: EPOCH_7D });
      const result = buildSubscriptionUsageAllSegment(input, WITH_ALL);
      const barMatches = result.match(/\[[\u2588\u2591]+\]/g);
      expect(barMatches).not.toBeNull();
      expect(barMatches?.length).toBe(2);
    });

    it('should omit bars for both windows when showBars is false', () => {
      const input = makeInput({ pct: 55, epoch: EPOCH_5H }, { pct: 20, epoch: EPOCH_7D });
      const result = buildSubscriptionUsageAllSegment(input, WITH_EMOJIS_NO_BARS);
      expect(result).not.toMatch(/\[[\u2588\u2591]+\]/);
    });
  });

  describe('resets_at unix seconds conversion', () => {
    it('should produce a formatted reset time from epoch seconds', () => {
      // Any valid epoch should yield a time string like (~3:45pm)
      const input = makeInput({ pct: 50, epoch: EPOCH_5H });
      const result = buildSubscriptionUsageSegment(input, WITH_ALL);
      expect(result).toMatch(/\(~\d+/);
    });
  });
});
