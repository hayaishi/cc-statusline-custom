import { beforeEach, describe, expect, it, vi } from 'vitest';

import { acquireLock, releaseLock, writeCacheAtomic } from './cache.js';
import type { SubscriptionUsageEntry } from '../types/cache.js';

const fsMocks = vi.hoisted(() => ({
  writeFileSync: vi.fn(),
  renameSync: vi.fn(),
  unlinkSync: vi.fn(),
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  statSync: vi.fn(),
  openSync: vi.fn(),
  closeSync: vi.fn(),
}));

vi.mock('node:fs', () => fsMocks);

describe('cache error handling', () => {
  const entry: SubscriptionUsageEntry = {
    utilizationPercent: 55,
    resetsAt: '2026-01-20T15:45:00Z',
    lastError: null,
    lastAttemptAt: '2026-01-20T10:00:00Z',
    updatedAt: '2026-01-20T10:00:00Z',
  };

  beforeEach(() => {
    fsMocks.writeFileSync.mockReset();
    fsMocks.renameSync.mockReset();
    fsMocks.unlinkSync.mockReset();
    fsMocks.existsSync.mockReset();
    fsMocks.mkdirSync.mockReset();
    fsMocks.statSync.mockReset();
    fsMocks.openSync.mockReset();
    fsMocks.closeSync.mockReset();
    fsMocks.existsSync.mockReturnValue(true);
    fsMocks.openSync.mockReturnValue(3);
  });

  it('writeCacheAtomic cleans up temp file when rename fails', () => {
    fsMocks.renameSync.mockImplementation(() => {
      throw new Error('rename-failed');
    });

    expect(() => {
      writeCacheAtomic('subscriptionUsage', entry, '/cache');
    }).toThrow('rename-failed');
    expect(fsMocks.unlinkSync).toHaveBeenCalledTimes(1);
  });

  it('acquireLock returns false when openSync fails', () => {
    fsMocks.existsSync.mockReturnValue(false);
    fsMocks.openSync.mockImplementation(() => {
      throw new Error('open-failed');
    });

    const result = acquireLock('/cache');

    expect(result).toBe(false);
    expect(fsMocks.openSync).toHaveBeenCalledTimes(1);
  });

  it('acquireLock proceeds after statSync failure and ignores close errors', () => {
    fsMocks.existsSync.mockReturnValue(true);
    fsMocks.statSync.mockImplementation(() => {
      throw new Error('stat-failed');
    });
    fsMocks.closeSync.mockImplementation(() => {
      throw new Error('close-failed');
    });

    const result = acquireLock('/cache');

    expect(result).toBe(true);
    expect(fsMocks.writeFileSync).toHaveBeenCalledTimes(1);
  });

  it('acquireLock returns false when writeFileSync fails but closes fd', () => {
    fsMocks.existsSync.mockReturnValue(false);
    fsMocks.openSync.mockReturnValue(9);
    fsMocks.writeFileSync.mockImplementation(() => {
      throw new Error('write-failed');
    });

    const result = acquireLock('/cache');

    expect(result).toBe(false);
    expect(fsMocks.closeSync).toHaveBeenCalledTimes(1);
  });

  it('releaseLock ignores unlink errors', () => {
    fsMocks.existsSync.mockReturnValue(true);
    fsMocks.unlinkSync.mockImplementation(() => {
      throw new Error('unlink-failed');
    });

    expect(() => {
      releaseLock('/cache');
    }).not.toThrow();
  });
});
