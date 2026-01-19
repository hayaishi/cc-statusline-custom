import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { updateCache } from './cache-updater.js';

describe('cache-updater', () => {
  const testDir = join(tmpdir(), `ccusage-statusline-updater-test-${String(process.pid)}`);

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

  describe('updateCache', () => {
    it('returns success result', () => {
      const result = updateCache(testDir);
      expect(result.success).toBe(true);
      expect(result.message).toContain('Cache updated');
    });

    it('creates daily-total.json', () => {
      updateCache(testDir);

      const filePath = join(testDir, 'daily-total.json');
      expect(existsSync(filePath)).toBe(true);

      const content = readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(content) as { cost_usd: number; date: string; updated_at: number };
      expect(typeof parsed.cost_usd).toBe('number');
      expect(typeof parsed.date).toBe('string');
      expect(typeof parsed.updated_at).toBe('number');
    });

    it('creates block-info.json', () => {
      updateCache(testDir);

      const filePath = join(testDir, 'block-info.json');
      expect(existsSync(filePath)).toBe(true);

      const content = readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(content) as { cost_usd: number; remaining_seconds: number; updated_at: number };
      expect(typeof parsed.cost_usd).toBe('number');
      expect(typeof parsed.remaining_seconds).toBe('number');
      expect(typeof parsed.updated_at).toBe('number');
    });

    it('creates burn-rate.json', () => {
      updateCache(testDir);

      const filePath = join(testDir, 'burn-rate.json');
      expect(existsSync(filePath)).toBe(true);

      const content = readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(content) as { rate_per_hour: number; updated_at: number };
      expect(typeof parsed.rate_per_hour).toBe('number');
      expect(typeof parsed.updated_at).toBe('number');
    });

    it('releases lock after update', () => {
      updateCache(testDir);

      const lockPath = join(testDir, 'cache.lock');
      expect(existsSync(lockPath)).toBe(false);
    });

    it('returns error result if lock cannot be acquired', () => {
      // Manually create a fresh lock file
      const lockPath = join(testDir, 'cache.lock');
      writeFileSync(lockPath, 'locked');

      const result = updateCache(testDir);

      // Should fail because lock is held
      expect(result.success).toBe(false);
      expect(result.message).toContain('lock');
    });
  });
});
