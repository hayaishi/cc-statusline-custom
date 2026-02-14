import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { updateCache } from './update-cache.js';
import type { OAuthUsage } from '../experimental/subscription-usage/oauth.js';

interface UpdaterDeps {
  getOAuthToken: () => string | null;
  fetchOAuthUsage: (token: string, options?: Record<string, unknown>) => Promise<OAuthUsage>;
}

interface GlobalState {
  __ccUpdaterDeps?: UpdaterDeps;
}

describe('updateCache wrapper', () => {
  const testDir = join(tmpdir(), `cc-statusline-custom-wrapper-test-${String(process.pid)}`);

  beforeEach(() => {
    if (!existsSync(testDir)) {
      mkdirSync(testDir, { recursive: true });
    }
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
    const globalState = globalThis as GlobalState;
    delete globalState.__ccUpdaterDeps;
  });

  it('should delegate to the experimental updater and write subscription cache', async () => {
    const mockFetchOAuthUsage = vi.fn((): Promise<OAuthUsage> => Promise.resolve({
      fiveHours: {
        utilization: 55,
        resetsAt: '2026-01-20T15:45:00Z',
      },
    }));

    const globalState = globalThis as GlobalState;
    globalState.__ccUpdaterDeps = {
      getOAuthToken: (): string => 'test-token',
      fetchOAuthUsage: mockFetchOAuthUsage,
    };

    const result = await updateCache(testDir);

    expect(result.success).toBe(true);
    expect(mockFetchOAuthUsage).toHaveBeenCalledTimes(1);

    const cachePath = join(testDir, 'subscription-usage.json');
    expect(existsSync(cachePath)).toBe(true);

    const parsed = JSON.parse(readFileSync(cachePath, 'utf-8')) as {
      utilizationPercent?: number;
      resetsAt?: string;
      lastError?: string | null;
    };
    expect(parsed.utilizationPercent).toBe(55);
    expect(parsed.resetsAt).toBe('2026-01-20T15:45:00Z');
    expect(parsed.lastError).toBeNull();
  });

  it('should forward debug and version options to the experimental updater', async () => {
    const mockFetchOAuthUsage = vi.fn((_token: string, options?: Record<string, unknown>): Promise<OAuthUsage> => {
      expect(options).toEqual(expect.objectContaining({
        version: '2.1.37',
        debugLogOptions: expect.objectContaining({
          enabled: true,
        }),
      }));

      return Promise.resolve({
        fiveHours: {
          utilization: 10,
          resetsAt: '2026-01-20T15:45:00Z',
        },
      });
    });

    const globalState = globalThis as GlobalState;
    globalState.__ccUpdaterDeps = {
      getOAuthToken: (): string => 'test-token',
      fetchOAuthUsage: mockFetchOAuthUsage,
    };

    const result = await updateCache(testDir, {
      ccVersion: '2.1.37',
      debug: true,
      mode: 'force',
    });

    expect(result.success).toBe(true);
    expect(mockFetchOAuthUsage).toHaveBeenCalledTimes(1);
  });
});
