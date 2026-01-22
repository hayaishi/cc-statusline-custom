import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  readCacheSync,
  readCacheSyncWithMtime,
} from './cache-reader.js';
import type { SubscriptionUsageEntry } from '../types/cache.js';

describe('cache-reader', () => {
  const testDir = join(tmpdir(), `ccusage-statusline-test-${String(process.pid)}`);

  beforeEach(() => {
    // Create test directory
    if (!existsSync(testDir)) {
      mkdirSync(testDir, { recursive: true });
    }
  });

  afterEach(() => {
    // Clean up test directory
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('readCacheSync', () => {
    it('returns null for non-existent file', () => {
      const result = readCacheSync('subscriptionUsage', testDir);
      expect(result).toBeNull();
    });

    it('returns null for empty file', () => {
      const filePath = join(testDir, 'subscription-usage.json');
      writeFileSync(filePath, '');
      const result = readCacheSync('subscriptionUsage', testDir);
      expect(result).toBeNull();
    });

    it('returns null for invalid JSON', () => {
      const filePath = join(testDir, 'subscription-usage.json');
      writeFileSync(filePath, 'not json');
      const result = readCacheSync('subscriptionUsage', testDir);
      expect(result).toBeNull();
    });

    it('returns null for non-object JSON', () => {
      const filePath = join(testDir, 'subscription-usage.json');
      writeFileSync(filePath, '[]');
      const result = readCacheSync('subscriptionUsage', testDir);
      expect(result).toBeNull();
    });

    it('returns null for file exceeding max size', () => {
      const filePath = join(testDir, 'subscription-usage.json');
      // Create a file larger than 1KB
      const largeContent = JSON.stringify({ data: 'x'.repeat(2000) });
      writeFileSync(filePath, largeContent);
      const result = readCacheSync('subscriptionUsage', testDir);
      expect(result).toBeNull();
    });

    it('reads valid subscription-usage.json', () => {
      const filePath = join(testDir, 'subscription-usage.json');
      const entry: SubscriptionUsageEntry = {
        utilizationPercent: 55,
        resetsAt: '2026-01-20T15:45:00Z',
        updatedAt: '2026-01-20T10:00:00Z',
        lastError: null,
        lastAttemptAt: '2026-01-20T10:00:00Z',
      };
      writeFileSync(filePath, JSON.stringify(entry));
      const result = readCacheSync('subscriptionUsage', testDir);
      expect(result).toEqual(entry);
    });

    it('skips read when lock file is fresh (< 5 seconds old)', () => {
      // Create valid cache file
      const cacheFile = join(testDir, 'subscription-usage.json');
      const entry: SubscriptionUsageEntry = {
        utilizationPercent: 55,
        resetsAt: '2026-01-20T15:45:00Z',
        updatedAt: '2026-01-20T10:00:00Z',
        lastError: null,
        lastAttemptAt: '2026-01-20T10:00:00Z',
      };
      writeFileSync(cacheFile, JSON.stringify(entry));

      // Create fresh lock file
      const lockFile = join(testDir, 'cache.lock');
      writeFileSync(lockFile, 'locked');

      // Should return null because lock file is fresh
      const result = readCacheSync('subscriptionUsage', testDir);
      expect(result).toBeNull();
    });

    it('reads cache when lock file is stale (> 5 seconds old)', () => {
      // Create valid cache file
      const cacheFile = join(testDir, 'subscription-usage.json');
      const entry: SubscriptionUsageEntry = {
        utilizationPercent: 55,
        resetsAt: '2026-01-20T15:45:00Z',
        updatedAt: '2026-01-20T10:00:00Z',
        lastError: null,
        lastAttemptAt: '2026-01-20T10:00:00Z',
      };
      writeFileSync(cacheFile, JSON.stringify(entry));

      // Create lock file with old mtime
      const lockFile = join(testDir, 'cache.lock');
      writeFileSync(lockFile, 'locked');

      // Set lock file mtime to 10 seconds ago
      const oldTime = new Date(Date.now() - 10000);
      utimesSync(lockFile, oldTime, oldTime);

      const result = readCacheSync('subscriptionUsage', testDir);
      expect(result).toEqual(entry);
    });

    describe('mtime-based TTL guard', () => {
      it('returns null when file mtime exceeds TTL', () => {
        const cacheFile = join(testDir, 'subscription-usage.json');
        const entry: SubscriptionUsageEntry = {
          utilizationPercent: 55,
          resetsAt: '2026-01-20T15:45:00Z',
          updatedAt: '2026-01-20T10:00:00Z',
          lastError: null,
          lastAttemptAt: '2026-01-20T10:00:00Z',
        };
        writeFileSync(cacheFile, JSON.stringify(entry));

        // Set file mtime to 120 seconds ago (older than default 60s TTL)
        const oldTime = new Date(Date.now() - 120000);
        utimesSync(cacheFile, oldTime, oldTime);

        const result = readCacheSync('subscriptionUsage', testDir);
        expect(result).toBeNull();
      });

      it('reads cache when file mtime is within TTL', () => {
        const cacheFile = join(testDir, 'subscription-usage.json');
        const entry: SubscriptionUsageEntry = {
          utilizationPercent: 55,
          resetsAt: '2026-01-20T15:45:00Z',
          updatedAt: '2026-01-20T10:00:00Z',
          lastError: null,
          lastAttemptAt: '2026-01-20T10:00:00Z',
        };
        writeFileSync(cacheFile, JSON.stringify(entry));

        // File just created, mtime is fresh (within 60s TTL)
        const result = readCacheSync('subscriptionUsage', testDir);
        expect(result).toEqual(entry);
      });

      it('returns null at exactly TTL boundary', () => {
        const cacheFile = join(testDir, 'subscription-usage.json');
        const entry: SubscriptionUsageEntry = {
          utilizationPercent: 55,
          resetsAt: '2026-01-20T15:45:00Z',
          updatedAt: '2026-01-20T10:00:00Z',
          lastError: null,
          lastAttemptAt: '2026-01-20T10:00:00Z',
        };
        writeFileSync(cacheFile, JSON.stringify(entry));

        // Set file mtime to exactly 60 seconds ago
        const exactlyTtl = new Date(Date.now() - 60000);
        utimesSync(cacheFile, exactlyTtl, exactlyTtl);

        const result = readCacheSync('subscriptionUsage', testDir);
        expect(result).toBeNull();
      });

      it('respects custom TTL parameter', () => {
        const cacheFile = join(testDir, 'subscription-usage.json');
        const entry: SubscriptionUsageEntry = {
          utilizationPercent: 55,
          resetsAt: '2026-01-20T15:45:00Z',
          updatedAt: '2026-01-20T10:00:00Z',
          lastError: null,
          lastAttemptAt: '2026-01-20T10:00:00Z',
        };
        writeFileSync(cacheFile, JSON.stringify(entry));

        // Set file mtime to 30 seconds ago
        const thirtySecondsAgo = new Date(Date.now() - 30000);
        utimesSync(cacheFile, thirtySecondsAgo, thirtySecondsAgo);

        // With TTL of 20 seconds, should return null
        const resultStale = readCacheSync('subscriptionUsage', testDir, 20);
        expect(resultStale).toBeNull();

        // With TTL of 60 seconds, should return entry
        const resultFresh = readCacheSync('subscriptionUsage', testDir, 60);
        expect(resultFresh).toEqual(entry);
      });
    });
  });

  describe('readCacheSyncWithMtime', () => {
    it('returns entry with isFresh=false when mtime exceeds TTL', () => {
      const cacheFile = join(testDir, 'subscription-usage.json');
      const entry: SubscriptionUsageEntry = {
        utilizationPercent: 55,
        resetsAt: '2026-01-20T15:45:00Z',
        updatedAt: '2026-01-20T10:00:00Z',
        lastError: null,
        lastAttemptAt: '2026-01-20T10:00:00Z',
      };
      writeFileSync(cacheFile, JSON.stringify(entry));

      const oldTime = new Date(Date.now() - 120000);
      utimesSync(cacheFile, oldTime, oldTime);

      const result = readCacheSyncWithMtime('subscriptionUsage', testDir, 60);
      expect(result.isFresh).toBe(false);
      expect(result.entry).toEqual(entry);
    });

    it('returns entry with isFresh=true when mtime is within TTL', () => {
      const cacheFile = join(testDir, 'subscription-usage.json');
      const entry: SubscriptionUsageEntry = {
        utilizationPercent: 55,
        resetsAt: '2026-01-20T15:45:00Z',
        updatedAt: '2026-01-20T10:00:00Z',
        lastError: null,
        lastAttemptAt: '2026-01-20T10:00:00Z',
      };
      writeFileSync(cacheFile, JSON.stringify(entry));

      const result = readCacheSyncWithMtime('subscriptionUsage', testDir, 60);
      expect(result.isFresh).toBe(true);
      expect(result.entry).toEqual(entry);
    });
  });
});
