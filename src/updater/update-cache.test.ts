import { describe, it, expect, beforeEach, afterEach, beforeAll, vi } from 'vitest';
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { OAuthUsage } from './oauth.js';

const mockGetOAuthToken = vi.fn((): string | null => 'test-token');
const mockFetchOAuthUsage = vi.fn((): Promise<OAuthUsage> => Promise.resolve({
  fiveHours: {
    utilization: 55,
    resetsAt: '2026-01-20T15:45:00Z',
  },
}));

vi.mock('./token.js', () => ({
  getOAuthToken: mockGetOAuthToken,
}));

vi.mock('./oauth.js', () => ({
  fetchOAuthUsage: mockFetchOAuthUsage,
}));

let updateCache: typeof import('./update-cache.js').updateCache;
let normalizeUtilizationPercent: typeof import('./update-cache.js').normalizeUtilizationPercent;

beforeAll(async () => {
  const module = await import('./update-cache.js');
  updateCache = module.updateCache;
  normalizeUtilizationPercent = module.normalizeUtilizationPercent;
});

describe('update-cache', () => {
  const testDir = join(tmpdir(), `cc-statusline-custom-updater-test-${String(process.pid)}`);

  beforeEach(() => {
    if (!existsSync(testDir)) {
      mkdirSync(testDir, { recursive: true });
    }
    mockGetOAuthToken.mockClear();
    mockFetchOAuthUsage.mockClear();
    // Reset default mock implementation
    mockFetchOAuthUsage.mockResolvedValue({
      fiveHours: {
        utilization: 55,
        resetsAt: '2026-01-20T15:45:00Z',
      },
    });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
    const globalState = globalThis as { __ccUpdaterDeps?: unknown };
    delete globalState.__ccUpdaterDeps;
  });

  it('should return success result when update completes', async () => {
    const result = await updateCache(testDir);
    expect(result.success).toBe(true);
    expect(result.message).toContain('Cache updated');
    expect(mockGetOAuthToken).toHaveBeenCalledTimes(1);
    expect(mockFetchOAuthUsage).toHaveBeenCalledTimes(1);
  });

  it('should pass debug log options to oauth fetch in debug mode', async () => {
    await updateCache(testDir, { debug: true });

    expect(mockFetchOAuthUsage).toHaveBeenCalledWith(
      'test-token',
      expect.objectContaining({
        debugLogOptions: expect.objectContaining({
          enabled: true,
        }),
      })
    );
  });

  it('should not pass debug log options when debug mode is disabled', async () => {
    await updateCache(testDir, { debug: false });

    expect(mockFetchOAuthUsage).toHaveBeenCalledWith('test-token', undefined);
  });

  it('should normalize utilization when rounding and clamping', () => {
    expect(normalizeUtilizationPercent(42.5)).toBe(43);
    expect(normalizeUtilizationPercent(42.4)).toBe(42);
    expect(normalizeUtilizationPercent(150)).toBe(100);
    expect(normalizeUtilizationPercent(-10)).toBe(0);
  });

  it('should return null when utilization is non-finite', () => {
    expect(normalizeUtilizationPercent(Number.NaN)).toBeNull();
    expect(normalizeUtilizationPercent(Number.POSITIVE_INFINITY)).toBeNull();
    expect(normalizeUtilizationPercent(Number.NEGATIVE_INFINITY)).toBeNull();
  });

  it('should create subscription-usage.json when using default 5h data', async () => {
    await updateCache(testDir);

    const filePath = join(testDir, 'subscription-usage.json');
    expect(existsSync(filePath)).toBe(true);

    const content = readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(content) as {
      lastError: string | null;
      utilizationPercent?: number;
      resetsAt?: string;
      window?: string;
      fiveHours?: { utilizationPercent: number; resetsAt: string };
      sevenDays?: { utilizationPercent: number; resetsAt: string };
    };
    expect(parsed.utilizationPercent).toBe(55);
    expect(parsed.resetsAt).toBe('2026-01-20T15:45:00Z');
    expect(parsed.window).toBe('five_hours');
    expect(parsed.fiveHours).toEqual({
      utilizationPercent: 55,
      resetsAt: '2026-01-20T15:45:00Z',
    });
    expect(parsed.sevenDays).toBeUndefined();
  });

  it('should use 7d window when utilization is 100% or more', async () => {
    mockFetchOAuthUsage.mockResolvedValue({
      fiveHours: {
        utilization: 10,
        resetsAt: '2026-01-20T15:45:00Z',
      },
      sevenDays: {
        utilization: 100, // 100%
        resetsAt: '2026-01-27T15:45:00Z',
      },
    });

    await updateCache(testDir);

    const content = readFileSync(join(testDir, 'subscription-usage.json'), 'utf-8');
    const parsed = JSON.parse(content) as {
      utilizationPercent?: number;
      resetsAt?: string;
      window?: string;
      fiveHours?: { utilizationPercent: number; resetsAt: string };
      sevenDays?: { utilizationPercent: number; resetsAt: string };
    };
    expect(parsed.utilizationPercent).toBe(100);
    expect(parsed.resetsAt).toBe('2026-01-27T15:45:00Z');
    expect(parsed.window).toBe('seven_days');
    expect(parsed.fiveHours).toEqual({
      utilizationPercent: 10,
      resetsAt: '2026-01-20T15:45:00Z',
    });
    expect(parsed.sevenDays).toEqual({
      utilizationPercent: 100,
      resetsAt: '2026-01-27T15:45:00Z',
    });
  });

  it('should prioritize 5h window when 7d utilization is less than 100%', async () => {
    mockFetchOAuthUsage.mockResolvedValue({
      fiveHours: {
        utilization: 100,
        resetsAt: '2026-01-20T15:45:00Z',
      },
      sevenDays: {
        utilization: 90, // 90%
        resetsAt: '2026-01-27T15:45:00Z',
      },
    });

    await updateCache(testDir);

    const content = readFileSync(join(testDir, 'subscription-usage.json'), 'utf-8');
    const parsed = JSON.parse(content) as {
      utilizationPercent?: number;
      resetsAt?: string;
      window?: string;
      fiveHours?: { utilizationPercent: number; resetsAt: string };
      sevenDays?: { utilizationPercent: number; resetsAt: string };
    };
    expect(parsed.utilizationPercent).toBe(100);
    expect(parsed.resetsAt).toBe('2026-01-20T15:45:00Z');
    expect(parsed.window).toBe('five_hours');
    expect(parsed.fiveHours).toEqual({
      utilizationPercent: 100,
      resetsAt: '2026-01-20T15:45:00Z',
    });
    expect(parsed.sevenDays).toEqual({
      utilizationPercent: 90,
      resetsAt: '2026-01-27T15:45:00Z',
    });
  });

  it('should use 5h window when 7d is missing', async () => {
    mockFetchOAuthUsage.mockResolvedValue({
      fiveHours: {
        utilization: 60,
        resetsAt: '2026-01-20T15:45:00Z',
      },
    });

    await updateCache(testDir);

    const content = readFileSync(join(testDir, 'subscription-usage.json'), 'utf-8');
    const parsed = JSON.parse(content) as {
      utilizationPercent?: number;
      resetsAt?: string;
    };
    expect(parsed.utilizationPercent).toBe(60);
    expect(parsed.resetsAt).toBe('2026-01-20T15:45:00Z');
  });

  it('should use 7d window when 5h is missing', async () => {
    mockFetchOAuthUsage.mockResolvedValue({
      sevenDays: {
        utilization: 80,
        resetsAt: '2026-02-01T14:00:00.287052+00:00',
      },
    });

    await updateCache(testDir);

    const content = readFileSync(join(testDir, 'subscription-usage.json'), 'utf-8');
    const parsed = JSON.parse(content) as {
      utilizationPercent?: number;
      resetsAt?: string;
      window?: string;
    };
    expect(parsed.utilizationPercent).toBe(80);
    expect(parsed.resetsAt).toBe('2026-02-01T14:00:00.287052+00:00');
    expect(parsed.window).toBe('seven_days');
  });

  it('should write only subscription-usage.json when updating cache', async () => {
    await updateCache(testDir);

    const entries = readdirSync(testDir, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .filter((name) => name !== 'cache.lock');

    expect(entries.sort()).toEqual(['subscription-usage.json']);
  });

  it('should return error result when lock cannot be acquired', async () => {
    const lockPath = join(testDir, 'cache.lock');
    writeFileSync(lockPath, 'locked');

    const result = await updateCache(testDir);

    expect(result.success).toBe(false);
    expect(result.message).toContain('lock');
  });

  it('should record token error when token is missing', async () => {
    mockGetOAuthToken.mockReturnValueOnce(null);

    await updateCache(testDir);

    const content = readFileSync(join(testDir, 'subscription-usage.json'), 'utf-8');
    const parsed = JSON.parse(content) as { lastError: string | null; lastAttemptAt?: string };
    expect(parsed.lastError).toBe('token_missing');
    expect(typeof parsed.lastAttemptAt).toBe('string');
    expect(mockFetchOAuthUsage).not.toHaveBeenCalled();
  });

  it('should record oauth status error when fetch fails in debug mode', async () => {
    const error = new Error('oauth_status_401');
    (error as { responseBody?: string }).responseBody = '{"error":"unauthorized"}';
    mockFetchOAuthUsage.mockRejectedValueOnce(error);

    await updateCache(testDir, { debug: true });

    const content = readFileSync(join(testDir, 'subscription-usage.json'), 'utf-8');
    const parsed = JSON.parse(content) as { lastError?: string; lastErrorDetail?: string | null };
    expect(parsed.lastError).toBe('oauth_status_401');
    expect(parsed.lastErrorDetail).toBe('{"error":"unauthorized"}');
  });

  it('should record oauth response detail when parsing fails in debug mode', async () => {
    const error = new Error('oauth_response_invalid');
    (error as { responseBody?: string }).responseBody = '{"unexpected":true}';
    mockFetchOAuthUsage.mockRejectedValueOnce(error);

    await updateCache(testDir, { debug: true });

    const content = readFileSync(join(testDir, 'subscription-usage.json'), 'utf-8');
    const parsed = JSON.parse(content) as { lastError?: string; lastErrorDetail?: string | null };
    expect(parsed.lastError).toBe('oauth_response_invalid');
    expect(parsed.lastErrorDetail).toBe('{"unexpected":true}');
  });

  it('should record oauth network error when fetch throws with code (no detail)', async () => {
    const error = new Error('socket hang up');
    (error as { code?: string }).code = 'ECONNRESET';
    mockFetchOAuthUsage.mockRejectedValueOnce(error);

    await updateCache(testDir, { debug: true });

    const content = readFileSync(join(testDir, 'subscription-usage.json'), 'utf-8');
    const parsed = JSON.parse(content) as { lastError?: string; lastErrorDetail?: string | null };
    expect(parsed.lastError).toBe('oauth_network_ECONNRESET');
    expect(parsed.lastErrorDetail).toBeUndefined();
  });

  it('does not record oauth error detail without debug', async () => {
    const error = new Error('oauth_status_401');
    (error as { responseBody?: string }).responseBody = '{"error":"unauthorized"}';
    mockFetchOAuthUsage.mockRejectedValueOnce(error);

    await updateCache(testDir);

    const content = readFileSync(join(testDir, 'subscription-usage.json'), 'utf-8');
    const parsed = JSON.parse(content) as { lastError?: string; lastErrorDetail?: string | null };
    expect(parsed.lastError).toBe('oauth_status_401');
    expect(parsed.lastErrorDetail).toBeUndefined();
  });

  it('should release lock after successful update', async () => {
    await updateCache(testDir);

    const lockPath = join(testDir, 'cache.lock');
    expect(existsSync(lockPath)).toBe(false);
  });

  it('should use 5h window when 7d utilization rounds to 99%', async () => {
    mockFetchOAuthUsage.mockResolvedValue({
      fiveHours: {
        utilization: 50,
        resetsAt: '2026-01-20T15:45:00Z',
      },
      sevenDays: {
        utilization: 99.4, // rounds to 99, not 100
        resetsAt: '2026-01-27T15:45:00Z',
      },
    });

    await updateCache(testDir);

    const content = readFileSync(join(testDir, 'subscription-usage.json'), 'utf-8');
    const parsed = JSON.parse(content) as { window?: string };
    expect(parsed.window).toBe('five_hours');
  });

  it('should use 7d window when 7d utilization rounds to 100%', async () => {
    mockFetchOAuthUsage.mockResolvedValue({
      fiveHours: {
        utilization: 50,
        resetsAt: '2026-01-20T15:45:00Z',
      },
      sevenDays: {
        utilization: 99.5, // rounds to 100
        resetsAt: '2026-01-27T15:45:00Z',
      },
    });

    await updateCache(testDir);

    const content = readFileSync(join(testDir, 'subscription-usage.json'), 'utf-8');
    const parsed = JSON.parse(content) as { window?: string };
    expect(parsed.window).toBe('seven_days');
  });

  it('should return error when 7d has invalid resetsAt', async () => {
    mockFetchOAuthUsage.mockResolvedValue({
      fiveHours: {
        utilization: 50,
        resetsAt: '2026-01-20T15:45:00Z',
      },
      sevenDays: {
        utilization: 100,
        resetsAt: 'invalid-date',
      },
    });

    await updateCache(testDir);

    const content = readFileSync(join(testDir, 'subscription-usage.json'), 'utf-8');
    const parsed = JSON.parse(content) as { lastError?: string };
    expect(parsed.lastError).toBe('resets_at_invalid');
  });

  it('should return error when utilization is invalid', async () => {
    mockFetchOAuthUsage.mockResolvedValue({
      fiveHours: {
        utilization: Number.NaN,
        resetsAt: '2026-01-20T15:45:00Z',
      },
    });

    await updateCache(testDir);

    const content = readFileSync(join(testDir, 'subscription-usage.json'), 'utf-8');
    const parsed = JSON.parse(content) as { lastError?: string };
    expect(parsed.lastError).toBe('utilization_invalid');
  });

  it('uses test overrides when provided', async () => {
    const overrideGetOAuthToken = vi.fn((): string | null => 'override-token');
    const overrideFetchOAuthUsage = vi.fn((): Promise<OAuthUsage> => Promise.resolve({
      fiveHours: {
        utilization: 25,
        resetsAt: '2026-01-20T15:45:00Z',
      },
    }));
    const globalState = globalThis as { __ccUpdaterDeps?: unknown };
    globalState.__ccUpdaterDeps = {
      getOAuthToken: overrideGetOAuthToken,
      fetchOAuthUsage: overrideFetchOAuthUsage,
    };
    mockGetOAuthToken.mockClear();
    mockFetchOAuthUsage.mockClear();

    const result = await updateCache(testDir);

    expect(result.success).toBe(true);
    expect(overrideGetOAuthToken).toHaveBeenCalledTimes(1);
    expect(overrideFetchOAuthUsage).toHaveBeenCalledTimes(1);
    expect(mockGetOAuthToken).not.toHaveBeenCalled();
    expect(mockFetchOAuthUsage).not.toHaveBeenCalled();
  });

  describe('mode option', () => {
    it('force mode always attempts network fetch', async () => {
      // Create fresh, valid cache
      const cacheFile = join(testDir, 'subscription-usage.json');
      const freshEntry = {
        utilizationPercent: 50,
        resetsAt: '2026-01-20T15:45:00Z',
        lastError: null,
        lastAttemptAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      writeFileSync(cacheFile, JSON.stringify(freshEntry));

      // Force mode should still fetch
      mockFetchOAuthUsage.mockClear();
      const result = await updateCache(testDir, { mode: 'force' });
      expect(result.success).toBe(true);
      expect(mockFetchOAuthUsage).toHaveBeenCalledTimes(1);
    });

    it('auto mode skips when cache is fresh and valid', async () => {
      // Set TTL to ensure cache is considered fresh
      process.env.CCSTATUSLINE_SUBSCRIPTION_CACHE_TTL = '60';

      // Create fresh, valid cache
      const cacheFile = join(testDir, 'subscription-usage.json');
      const freshEntry = {
        utilizationPercent: 50,
        resetsAt: '2026-01-20T15:45:00Z',
        lastError: null,
        lastAttemptAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      writeFileSync(cacheFile, JSON.stringify(freshEntry));

      // Auto mode should skip
      mockFetchOAuthUsage.mockClear();
      const result = await updateCache(testDir, { mode: 'auto' });
      expect(result.success).toBe(true);
      expect(result.message).toContain('skipped');
      expect(mockFetchOAuthUsage).not.toHaveBeenCalled();
    });

    it('auto mode fetches when cache is missing', async () => {
      // No cache file
      mockFetchOAuthUsage.mockClear();
      const result = await updateCache(testDir, { mode: 'auto' });
      expect(result.success).toBe(true);
      expect(mockFetchOAuthUsage).toHaveBeenCalledTimes(1);
    });

    it('auto mode fetches when cache is expired', async () => {
      // Create old cache file
      const cacheFile = join(testDir, 'subscription-usage.json');
      const oldEntry = {
        utilizationPercent: 50,
        resetsAt: '2026-01-20T15:45:00Z',
        lastError: null,
        lastAttemptAt: new Date(Date.now() - 120 * 1000).toISOString(),
        updatedAt: new Date(Date.now() - 120 * 1000).toISOString(),
      };
      writeFileSync(cacheFile, JSON.stringify(oldEntry));

      // Set file mtime to 120 seconds ago
      const { utimesSync } = await import('node:fs');
      const oldTime = Date.now() / 1000 - 120;
      utimesSync(cacheFile, oldTime, oldTime);

      // Auto mode should fetch
      mockFetchOAuthUsage.mockClear();
      const result = await updateCache(testDir, { mode: 'auto' });
      expect(result.success).toBe(true);
      expect(mockFetchOAuthUsage).toHaveBeenCalledTimes(1);
    });

    it('auto mode fetches when cache has error', async () => {
      // Create cache with error
      const cacheFile = join(testDir, 'subscription-usage.json');
      const errorEntry = {
        lastError: 'oauth_fetch_failed',
        lastAttemptAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      writeFileSync(cacheFile, JSON.stringify(errorEntry));

      // Auto mode should fetch
      mockFetchOAuthUsage.mockClear();
      const result = await updateCache(testDir, { mode: 'auto' });
      expect(result.success).toBe(true);
      expect(mockFetchOAuthUsage).toHaveBeenCalledTimes(1);
    });

    it('auto mode fetches when utilizationPercent is out of range', async () => {
      const cacheFile = join(testDir, 'subscription-usage.json');
      const invalidEntry = {
        utilizationPercent: 200,
        resetsAt: '2026-01-20T15:45:00Z',
        lastError: null,
        lastAttemptAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      writeFileSync(cacheFile, JSON.stringify(invalidEntry));

      mockFetchOAuthUsage.mockClear();
      const result = await updateCache(testDir, { mode: 'auto' });
      expect(result.success).toBe(true);
      expect(mockFetchOAuthUsage).toHaveBeenCalledTimes(1);
    });

    it('auto mode fetches when utilizationPercent is missing', async () => {
      const cacheFile = join(testDir, 'subscription-usage.json');
      const invalidEntry = {
        resetsAt: '2026-01-20T15:45:00Z',
        lastError: null,
        lastAttemptAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      writeFileSync(cacheFile, JSON.stringify(invalidEntry));

      mockFetchOAuthUsage.mockClear();
      const result = await updateCache(testDir, { mode: 'auto' });
      expect(result.success).toBe(true);
      expect(mockFetchOAuthUsage).toHaveBeenCalledTimes(1);
    });

    it('auto mode fetches when resetsAt is invalid', async () => {
      const cacheFile = join(testDir, 'subscription-usage.json');
      const invalidEntry = {
        utilizationPercent: 55,
        resetsAt: 'invalid-date',
        lastError: null,
        lastAttemptAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      writeFileSync(cacheFile, JSON.stringify(invalidEntry));

      mockFetchOAuthUsage.mockClear();
      const result = await updateCache(testDir, { mode: 'auto' });
      expect(result.success).toBe(true);
      expect(mockFetchOAuthUsage).toHaveBeenCalledTimes(1);
    });

    it('defaults to force mode when mode is not specified', async () => {
      // Create fresh, valid cache
      const cacheFile = join(testDir, 'subscription-usage.json');
      const freshEntry = {
        utilizationPercent: 50,
        resetsAt: '2026-01-20T15:45:00Z',
        lastError: null,
        lastAttemptAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      writeFileSync(cacheFile, JSON.stringify(freshEntry));

      // No mode specified => should default to force
      mockFetchOAuthUsage.mockClear();
      const result = await updateCache(testDir);
      expect(result.success).toBe(true);
      expect(mockFetchOAuthUsage).toHaveBeenCalledTimes(1);
    });
  });
});
