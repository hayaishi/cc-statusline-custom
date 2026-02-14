import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { stripAnsi } from '../../utils/colors.js';
import {
  buildSubscriptionUsageAllSegment,
  buildSubscriptionUsageSegment,
  extractWindowData,
} from './segment-builders.js';
import type { RenderOptions } from '../../core/formatter.js';
import type { CacheEntry } from '../../types/cache.js';

const ONE_HOUR_SECONDS = 3600;
const DEFAULT_RENDER_OPTIONS: RenderOptions = {
  showEmojis: true,
  showBars: true,
};

describe('extractWindowData', () => {
  it('should accept utilizationPercent = 0 when values are valid', () => {
    const result = extractWindowData(
      {
        utilizationPercent: 0,
        resetsAt: '2026-01-27T15:45:00Z',
      },
      'five_hours'
    );

    expect(result).not.toBeNull();
    expect(result?.percent).toBe(0);
  });

  it('should return null when utilizationPercent is non-integer', () => {
    const result = extractWindowData(
      {
        utilizationPercent: 55.5,
        resetsAt: '2026-01-27T15:45:00Z',
      },
      'five_hours'
    );

    expect(result).toBeNull();
  });

  it('should return null when utilizationPercent is above 100', () => {
    const result = extractWindowData(
      {
        utilizationPercent: 101,
        resetsAt: '2026-02-01T22:45:00Z',
      },
      'seven_days'
    );

    expect(result).toBeNull();
  });
});

describe('buildSubscriptionUsageAllSegment', () => {
  const testCacheDir = join(tmpdir(), `cc-subscription-builders-test-${String(process.pid)}`);
  const originalTz = process.env.TZ;

  beforeEach(() => {
    process.env.TZ = 'UTC';
    if (!existsSync(testCacheDir)) {
      mkdirSync(testCacheDir, { recursive: true });
    }
  });

  afterEach(() => {
    if (originalTz === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = originalTz;
    }

    if (existsSync(testCacheDir)) {
      rmSync(testCacheDir, { recursive: true, force: true });
    }
  });

  const writeCache = (entry: CacheEntry): void => {
    writeFileSync(join(testCacheDir, 'subscription-usage.json'), JSON.stringify(entry));
  };

  it('should show fetch error when cache has recent failed attempt', () => {
    const nowIso = new Date().toISOString();
    writeCache({
      lastError: 'oauth_fetch_failed',
      lastAttemptAt: nowIso,
      updatedAt: nowIso,
    });

    const result = stripAnsi(buildSubscriptionUsageAllSegment(testCacheDir, ONE_HOUR_SECONDS, DEFAULT_RENDER_OPTIONS, false));
    expect(result).toBe('⌛️ Fetch Error...');
  });

  it('should show loading when lastAttemptAt is invalid', () => {
    writeCache({
      lastError: 'oauth_fetch_failed',
      lastAttemptAt: 'invalid-date',
      updatedAt: new Date().toISOString(),
    });

    const result = stripAnsi(buildSubscriptionUsageAllSegment(testCacheDir, ONE_HOUR_SECONDS, DEFAULT_RENDER_OPTIONS, false));
    expect(result).toBe('⌛️ Loading...');
  });

  it('should show only seven_days when fiveHours window is missing', () => {
    const nowIso = new Date().toISOString();
    writeCache({
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
    });

    const result = stripAnsi(buildSubscriptionUsageAllSegment(testCacheDir, ONE_HOUR_SECONDS, DEFAULT_RENDER_OPTIONS, false));
    expect(result).toBe('🌙 100% [████] (~2pm, Feb 1)');
  });

  it('should round minute 59 in fiveHours and sevenDays windows', () => {
    writeCache({
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
    });

    const result = stripAnsi(buildSubscriptionUsageAllSegment(testCacheDir, ONE_HOUR_SECONDS, DEFAULT_RENDER_OPTIONS, false));
    expect(result).toContain('55%');
    expect(result).toContain('75%');
    expect(result).toContain('(~3am)');
    expect(result).toContain('(~11pm, Feb 1)');
  });

  it('should show extra usage and five_hour when five_hour is 100%', () => {
    writeCache({
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
        usedCredits: 428,
        utilizationPercent: 8.56,
      },
      lastError: null,
    });

    const result = stripAnsi(buildSubscriptionUsageAllSegment(testCacheDir, ONE_HOUR_SECONDS, DEFAULT_RENDER_OPTIONS, false));
    expect(result).toContain('✨');
    expect(result).toContain('$4.28');
    expect(result).toContain('⌛️ 100%');
    expect(result).not.toContain('🌙');
  });

  it('should show extra usage and seven_day when seven_day is 100%', () => {
    writeCache({
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
        usedCredits: 428,
        utilizationPercent: 8.56,
      },
      lastError: null,
    });

    const result = stripAnsi(buildSubscriptionUsageAllSegment(testCacheDir, ONE_HOUR_SECONDS, DEFAULT_RENDER_OPTIONS, false));
    expect(result).toContain('✨');
    expect(result).toContain('$4.28');
    expect(result).toContain('🌙 100%');
    expect(result).not.toContain('⌛️');
  });

  it('should hide extra usage when no window reaches 100%', () => {
    writeCache({
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
        usedCredits: 428,
        utilizationPercent: 8.56,
      },
      lastError: null,
    });

    const result = stripAnsi(buildSubscriptionUsageAllSegment(testCacheDir, ONE_HOUR_SECONDS, DEFAULT_RENDER_OPTIONS, false));
    expect(result).not.toContain('✨');
    expect(result).toContain('⌛️');
    expect(result).toContain('🌙');
  });
});

describe('buildSubscriptionUsageSegment', () => {
  const testCacheDir = join(tmpdir(), `cc-subscription-segment-test-${String(process.pid)}`);

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

  it('should include extra usage for subscription_usage when utilization reaches 100%', () => {
    writeFileSync(join(testCacheDir, 'subscription-usage.json'), JSON.stringify({
      utilizationPercent: 100,
      resetsAt: '2026-02-08T15:45:00Z',
      window: 'five_hours',
      fiveHours: {
        utilizationPercent: 100,
        resetsAt: '2026-02-08T15:45:00Z',
      },
      extraUsage: {
        isEnabled: true,
        usedCredits: 428,
        utilizationPercent: 8.56,
      },
      lastError: null,
    }));

    const result = stripAnsi(buildSubscriptionUsageSegment(testCacheDir, ONE_HOUR_SECONDS, DEFAULT_RENDER_OPTIONS, false));
    expect(result).toContain('✨');
    expect(result).toContain('$4.28');
    expect(result).toContain('⌛️ 100%');
  });
});
