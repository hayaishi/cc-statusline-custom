import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  readCacheSync,
  isCacheStale,
} from './cache-reader.js';
import type { DailyTotalEntry, BlockInfoEntry, BurnRateEntry } from '../types/cache.js';

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
      const result = readCacheSync('dailyTotal', testDir);
      expect(result).toBeNull();
    });

    it('returns null for empty file', () => {
      const filePath = join(testDir, 'daily-total.json');
      writeFileSync(filePath, '');
      const result = readCacheSync('dailyTotal', testDir);
      expect(result).toBeNull();
    });

    it('returns null for invalid JSON', () => {
      const filePath = join(testDir, 'daily-total.json');
      writeFileSync(filePath, 'not json');
      const result = readCacheSync('dailyTotal', testDir);
      expect(result).toBeNull();
    });

    it('returns null for non-object JSON', () => {
      const filePath = join(testDir, 'daily-total.json');
      writeFileSync(filePath, '[]');
      const result = readCacheSync('dailyTotal', testDir);
      expect(result).toBeNull();
    });

    it('returns null for file exceeding max size', () => {
      const filePath = join(testDir, 'daily-total.json');
      // Create a file larger than 1KB
      const largeContent = JSON.stringify({ data: 'x'.repeat(2000) });
      writeFileSync(filePath, largeContent);
      const result = readCacheSync('dailyTotal', testDir);
      expect(result).toBeNull();
    });

    it('reads valid daily-total.json', () => {
      const filePath = join(testDir, 'daily-total.json');
      const entry: DailyTotalEntry = {
        cost_usd: 1.23,
        date: '2026-01-19',
        updated_at: Date.now(),
      };
      writeFileSync(filePath, JSON.stringify(entry));
      const result = readCacheSync('dailyTotal', testDir);
      expect(result).toEqual(entry);
    });

    it('reads valid block-info.json', () => {
      const filePath = join(testDir, 'block-info.json');
      const entry: BlockInfoEntry = {
        cost_usd: 0.45,
        remaining_seconds: 9900,
        updated_at: Date.now(),
      };
      writeFileSync(filePath, JSON.stringify(entry));
      const result = readCacheSync('blockInfo', testDir);
      expect(result).toEqual(entry);
    });

    it('reads valid burn-rate.json', () => {
      const filePath = join(testDir, 'burn-rate.json');
      const entry: BurnRateEntry = {
        rate_per_hour: 0.12,
        updated_at: Date.now(),
      };
      writeFileSync(filePath, JSON.stringify(entry));
      const result = readCacheSync('burnRate', testDir);
      expect(result).toEqual(entry);
    });

    it('skips read when lock file is fresh (< 5 seconds old)', () => {
      // Create valid cache file
      const cacheFile = join(testDir, 'daily-total.json');
      const entry: DailyTotalEntry = {
        cost_usd: 1.23,
        date: '2026-01-19',
        updated_at: Date.now(),
      };
      writeFileSync(cacheFile, JSON.stringify(entry));

      // Create fresh lock file
      const lockFile = join(testDir, 'cache.lock');
      writeFileSync(lockFile, 'locked');

      // Should return null because lock file is fresh
      const result = readCacheSync('dailyTotal', testDir);
      expect(result).toBeNull();
    });

    it('reads cache when lock file is stale (> 5 seconds old)', () => {
      // Create valid cache file
      const cacheFile = join(testDir, 'daily-total.json');
      const entry: DailyTotalEntry = {
        cost_usd: 1.23,
        date: '2026-01-19',
        updated_at: Date.now(),
      };
      writeFileSync(cacheFile, JSON.stringify(entry));

      // Create lock file with old mtime
      const lockFile = join(testDir, 'cache.lock');
      writeFileSync(lockFile, 'locked');

      // Set lock file mtime to 10 seconds ago
      const oldTime = new Date(Date.now() - 10000);
      utimesSync(lockFile, oldTime, oldTime);

      const result = readCacheSync('dailyTotal', testDir);
      expect(result).toEqual(entry);
    });

    describe('mtime-based TTL guard', () => {
      it('returns null when file mtime exceeds TTL', () => {
        const cacheFile = join(testDir, 'daily-total.json');
        const entry: DailyTotalEntry = {
          cost_usd: 1.23,
          date: '2026-01-19',
          updated_at: Date.now(),
        };
        writeFileSync(cacheFile, JSON.stringify(entry));

        // Set file mtime to 120 seconds ago (older than default 60s TTL)
        const oldTime = new Date(Date.now() - 120000);
        utimesSync(cacheFile, oldTime, oldTime);

        const result = readCacheSync('dailyTotal', testDir);
        expect(result).toBeNull();
      });

      it('reads cache when file mtime is within TTL', () => {
        const cacheFile = join(testDir, 'daily-total.json');
        const entry: DailyTotalEntry = {
          cost_usd: 1.23,
          date: '2026-01-19',
          updated_at: Date.now(),
        };
        writeFileSync(cacheFile, JSON.stringify(entry));

        // File just created, mtime is fresh (within 60s TTL)
        const result = readCacheSync('dailyTotal', testDir);
        expect(result).toEqual(entry);
      });

      it('returns null at exactly TTL boundary', () => {
        const cacheFile = join(testDir, 'daily-total.json');
        const entry: DailyTotalEntry = {
          cost_usd: 1.23,
          date: '2026-01-19',
          updated_at: Date.now(),
        };
        writeFileSync(cacheFile, JSON.stringify(entry));

        // Set file mtime to exactly 60 seconds ago
        const exactlyTtl = new Date(Date.now() - 60000);
        utimesSync(cacheFile, exactlyTtl, exactlyTtl);

        const result = readCacheSync('dailyTotal', testDir);
        expect(result).toBeNull();
      });

      it('respects custom TTL parameter', () => {
        const cacheFile = join(testDir, 'daily-total.json');
        const entry: DailyTotalEntry = {
          cost_usd: 1.23,
          date: '2026-01-19',
          updated_at: Date.now(),
        };
        writeFileSync(cacheFile, JSON.stringify(entry));

        // Set file mtime to 30 seconds ago
        const thirtySecondsAgo = new Date(Date.now() - 30000);
        utimesSync(cacheFile, thirtySecondsAgo, thirtySecondsAgo);

        // With TTL of 20 seconds, should return null
        const resultStale = readCacheSync('dailyTotal', testDir, 20);
        expect(resultStale).toBeNull();

        // With TTL of 60 seconds, should return entry
        const resultFresh = readCacheSync('dailyTotal', testDir, 60);
        expect(resultFresh).toEqual(entry);
      });
    });
  });

  describe('isCacheStale', () => {
    it('returns true for entries older than TTL', () => {
      const entry: DailyTotalEntry = {
        cost_usd: 1.23,
        date: '2026-01-19',
        updated_at: Date.now() - 120000, // 120 seconds ago
      };
      expect(isCacheStale(entry, 60)).toBe(true);
    });

    it('returns false for entries within TTL', () => {
      const entry: DailyTotalEntry = {
        cost_usd: 1.23,
        date: '2026-01-19',
        updated_at: Date.now() - 30000, // 30 seconds ago
      };
      expect(isCacheStale(entry, 60)).toBe(false);
    });

    it('returns true for entries at exactly TTL boundary', () => {
      const entry: DailyTotalEntry = {
        cost_usd: 1.23,
        date: '2026-01-19',
        updated_at: Date.now() - 60000, // exactly 60 seconds ago
      };
      expect(isCacheStale(entry, 60)).toBe(true);
    });

    it('returns true for entries with invalid updated_at', () => {
      const entry = {
        cost_usd: 1.23,
        date: '2026-01-19',
        updated_at: NaN,
      } as DailyTotalEntry;
      expect(isCacheStale(entry, 60)).toBe(true);
    });
  });
});
