import { describe, it, expect, beforeEach, afterEach, beforeAll, vi } from 'vitest';
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { OAuthUsage } from './oauth.js';

const mockGetOAuthToken = vi.fn((): string | null => 'test-token');
const mockFetchOAuthUsage = vi.fn(async (): Promise<OAuthUsage> => ({
  utilization: 55,
  resetsAt: '2026-01-20T15:45:00Z',
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
  const testDir = join(tmpdir(), `ccusage-statusline-updater-test-${String(process.pid)}`);

  beforeEach(() => {
    if (!existsSync(testDir)) {
      mkdirSync(testDir, { recursive: true });
    }
    mockGetOAuthToken.mockClear();
    mockFetchOAuthUsage.mockClear();
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('returns success result', async () => {
    const result = await updateCache(testDir);
    expect(result.success).toBe(true);
    expect(result.message).toContain('Cache updated');
    expect(mockGetOAuthToken).toHaveBeenCalledTimes(1);
    expect(mockFetchOAuthUsage).toHaveBeenCalledTimes(1);
  });

  it('normalizes utilization with rounding and clamping', () => {
    expect(normalizeUtilizationPercent(42.5)).toBe(43);
    expect(normalizeUtilizationPercent(42.4)).toBe(42);
    expect(normalizeUtilizationPercent(150)).toBe(100);
    expect(normalizeUtilizationPercent(-10)).toBe(0);
  });

  it('treats non-finite utilization as invalid', () => {
    expect(normalizeUtilizationPercent(Number.NaN)).toBeNull();
    expect(normalizeUtilizationPercent(Number.POSITIVE_INFINITY)).toBeNull();
    expect(normalizeUtilizationPercent(Number.NEGATIVE_INFINITY)).toBeNull();
  });

  it('creates subscription-usage.json', async () => {
    await updateCache(testDir);

    const filePath = join(testDir, 'subscription-usage.json');
    expect(existsSync(filePath)).toBe(true);

    const content = readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(content) as {
      lastError: string | null;
      utilizationPercent?: number;
      resetsAt?: string;
      lastAttemptAt?: string;
    };
    expect(parsed.lastError === null || typeof parsed.lastError === 'string').toBe(true);
    expect(parsed.utilizationPercent).toBe(55);
    expect(parsed.resetsAt).toBe('2026-01-20T15:45:00Z');
    expect(typeof parsed.lastAttemptAt).toBe('string');
  });

  it('writes only subscription-usage.json', async () => {
    await updateCache(testDir);

    const entries = readdirSync(testDir, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .filter((name) => name !== 'cache.lock');

    expect(entries.sort()).toEqual(['subscription-usage.json']);
  });

  it('releases lock after update', async () => {
    await updateCache(testDir);

    const lockPath = join(testDir, 'cache.lock');
    expect(existsSync(lockPath)).toBe(false);
  });

  it('returns error result if lock cannot be acquired', async () => {
    const lockPath = join(testDir, 'cache.lock');
    writeFileSync(lockPath, 'locked');

    const result = await updateCache(testDir);

    expect(result.success).toBe(false);
    expect(result.message).toContain('lock');
  });

  it('records token errors without calling OAuth', async () => {
    mockGetOAuthToken.mockReturnValueOnce(null);

    await updateCache(testDir);

    const content = readFileSync(join(testDir, 'subscription-usage.json'), 'utf-8');
    const parsed = JSON.parse(content) as { lastError: string | null; lastAttemptAt?: string };
    expect(parsed.lastError).toBe('token_missing');
    expect(typeof parsed.lastAttemptAt).toBe('string');
    expect(mockFetchOAuthUsage).not.toHaveBeenCalled();
  });
});
