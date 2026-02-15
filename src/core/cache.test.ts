import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { writeCacheAtomic, acquireLock, releaseLock } from './cache.js';
import type { CacheEntry } from '../types/cache.js';

describe('cache', () => {
  const testDir = join(tmpdir(), `cc-statusline-custom-cache-test-${String(process.pid)}`);

  beforeEach(() => {
    if (!existsSync(testDir)) {
      mkdirSync(testDir, { recursive: true });
    }
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('writeCacheAtomic', () => {
    it('writes cache file atomically', () => {
      const entry: CacheEntry = {
        utilizationPercent: 55,
        resetsAt: '2026-01-20T15:45:00Z',
        lastError: null,
        lastAttemptAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      writeCacheAtomic('subscriptionUsage', entry, testDir);

      const filePath = join(testDir, 'subscription-usage.json');
      expect(existsSync(filePath)).toBe(true);

      const content = readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(content) as CacheEntry;
      expect(parsed).toEqual(entry);
    });

    it('creates cache directory if it does not exist', () => {
      const nestedDir = join(testDir, 'nested', 'cache');
      const entry: CacheEntry = {
        utilizationPercent: 55,
        resetsAt: '2026-01-20T15:45:00Z',
        lastError: null,
        lastAttemptAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      writeCacheAtomic('subscriptionUsage', entry, nestedDir);

      const filePath = join(nestedDir, 'subscription-usage.json');
      expect(existsSync(filePath)).toBe(true);
    });

    it('overwrites existing cache file', () => {
      const entry1: CacheEntry = {
        utilizationPercent: 10,
        resetsAt: '2026-01-20T10:00:00Z',
        lastError: null,
        lastAttemptAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const entry2: CacheEntry = {
        utilizationPercent: 55,
        resetsAt: '2026-01-20T15:45:00Z',
        lastError: null,
        lastAttemptAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      writeCacheAtomic('subscriptionUsage', entry1, testDir);
      writeCacheAtomic('subscriptionUsage', entry2, testDir);

      const filePath = join(testDir, 'subscription-usage.json');
      const content = readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(content) as CacheEntry;
      expect(parsed.utilizationPercent).toBe(55);
    });
  });

  describe('acquireLock / releaseLock', () => {
    it('creates lock file', () => {
      const success = acquireLock(testDir);
      expect(success).toBe(true);

      const lockPath = join(testDir, 'cache.lock');
      expect(existsSync(lockPath)).toBe(true);

      releaseLock(testDir);
    });

    it('releases lock file', () => {
      acquireLock(testDir);
      releaseLock(testDir);

      const lockPath = join(testDir, 'cache.lock');
      expect(existsSync(lockPath)).toBe(false);
    });

    it('returns false if lock already exists and is fresh', () => {
      const success1 = acquireLock(testDir);
      expect(success1).toBe(true);

      const success2 = acquireLock(testDir);
      expect(success2).toBe(false);

      releaseLock(testDir);
    });

    it('takes over stale lock (> 60 seconds old)', () => {
      const lockPath = join(testDir, 'cache.lock');

      // Create a stale lock file
      writeFileSync(lockPath, 'stale-pid', { mode: 0o600 });
      const oldTime = new Date(Date.now() - 120000); // 120 seconds ago
      utimesSync(lockPath, oldTime, oldTime);

      // Should be able to acquire the stale lock
      const success = acquireLock(testDir);
      expect(success).toBe(true);

      // Lock file should now contain our PID
      const content = readFileSync(lockPath, 'utf-8');
      expect(content).toBe(String(process.pid));

      releaseLock(testDir);
    });

    it('respects fresh lock from another process', () => {
      const lockPath = join(testDir, 'cache.lock');

      // Create a fresh lock file from "another process"
      writeFileSync(lockPath, 'other-pid', { mode: 0o600 });

      // Should NOT be able to acquire the fresh lock
      const success = acquireLock(testDir);
      expect(success).toBe(false);

      // Lock file should still contain other PID
      const content = readFileSync(lockPath, 'utf-8');
      expect(content).toBe('other-pid');
    });
  });
});
