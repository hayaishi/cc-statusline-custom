import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  formatPluginSegment,
  buildPluginSegment,
  isPluginSegmentId,
  parsePluginSegmentId,
  PLUGIN_SEGMENT_PREFIX,
} from './plugin-segment.js';
import type { PluginConfig, PluginCacheEntry } from '../types/plugin.js';
import type { RenderOptions } from './formatter.js';

describe('plugin-segment', () => {
  let tempDir: string;
  let pluginCacheDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'plugin-segment-test-'));
    pluginCacheDir = join(tempDir, 'plugins');
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('PLUGIN_SEGMENT_PREFIX', () => {
    it('should be "plugin:"', () => {
      expect(PLUGIN_SEGMENT_PREFIX).toBe('plugin:');
    });
  });

  describe('isPluginSegmentId', () => {
    it('should return true for plugin segment ids', () => {
      expect(isPluginSegmentId('plugin:git_branch')).toBe(true);
      expect(isPluginSegmentId('plugin:test')).toBe(true);
    });

    it('should return false for non-plugin segment ids', () => {
      expect(isPluginSegmentId('model')).toBe(false);
      expect(isPluginSegmentId('cost_session')).toBe(false);
      expect(isPluginSegmentId('plugingit_branch')).toBe(false);
      expect(isPluginSegmentId('')).toBe(false);
    });
  });

  describe('parsePluginSegmentId', () => {
    it('should extract plugin id from segment id', () => {
      expect(parsePluginSegmentId('plugin:git_branch')).toBe('git_branch');
      expect(parsePluginSegmentId('plugin:my-plugin')).toBe('my-plugin');
    });

    it('should return null for non-plugin segment ids', () => {
      expect(parsePluginSegmentId('model')).toBeNull();
      expect(parsePluginSegmentId('cost_session')).toBeNull();
    });
  });

  describe('formatPluginSegment', () => {
    const defaultOptions: RenderOptions = {
      showEmojis: true,
      showBars: true,
    };

    it('should format with emoji when showEmojis is true', () => {
      const config: PluginConfig = {
        id: 'git_branch',
        command: 'git branch',
        ttl: 60,
        emoji: '🌿',
      };
      const result = formatPluginSegment(config, 'main', defaultOptions);
      expect(result).toBe('🌿 main');
    });

    it('should format with fallbackText when showEmojis is false', () => {
      const config: PluginConfig = {
        id: 'git_branch',
        command: 'git branch',
        ttl: 60,
        emoji: '🌿',
        fallbackText: 'branch',
      };
      const options: RenderOptions = { showEmojis: false, showBars: true };
      const result = formatPluginSegment(config, 'main', options);
      expect(result).toBe('branch: main');
    });

    it('should format without prefix when no emoji and no fallbackText', () => {
      const config: PluginConfig = {
        id: 'counter',
        command: 'echo 5',
        ttl: 60,
      };
      const options: RenderOptions = { showEmojis: false, showBars: true };
      const result = formatPluginSegment(config, '5', options);
      expect(result).toBe('5');
    });

    it('should use fallbackValue when value is empty', () => {
      const config: PluginConfig = {
        id: 'test',
        command: 'echo',
        ttl: 60,
        emoji: '🔧',
        fallbackValue: 'N/A',
      };
      const result = formatPluginSegment(config, '', defaultOptions);
      expect(result).toBe('🔧 N/A');
    });

    it('should use default fallbackValue when not specified', () => {
      const config: PluginConfig = {
        id: 'test',
        command: 'echo',
        ttl: 60,
        emoji: '🔧',
      };
      const result = formatPluginSegment(config, '', defaultOptions);
      expect(result).toBe('🔧 ?');
    });
  });

  describe('buildPluginSegment', () => {
    const defaultOptions: RenderOptions = {
      showEmojis: true,
      showBars: true,
    };

    it('should return fallback when cache does not exist', () => {
      const config: PluginConfig = {
        id: 'git_branch',
        command: 'git branch',
        ttl: 60,
        emoji: '🌿',
        fallbackValue: '-',
      };
      const result = buildPluginSegment(config, tempDir, defaultOptions);
      expect(result).toBe('🌿 -');
    });

    it('should return cached value when cache exists', () => {
      mkdirSync(pluginCacheDir, { recursive: true });
      const entry: PluginCacheEntry = {
        value: 'main',
        updatedAt: new Date().toISOString(),
        error: null,
      };
      writeFileSync(join(pluginCacheDir, 'git_branch.json'), JSON.stringify(entry));

      const config: PluginConfig = {
        id: 'git_branch',
        command: 'git branch',
        ttl: 60,
        emoji: '🌿',
      };
      const result = buildPluginSegment(config, tempDir, defaultOptions);
      expect(result).toBe('🌿 main');
    });

    it('should return fallback when cache has error', () => {
      mkdirSync(pluginCacheDir, { recursive: true });
      const entry: PluginCacheEntry = {
        value: '',
        updatedAt: new Date().toISOString(),
        error: 'Command failed',
      };
      writeFileSync(join(pluginCacheDir, 'test.json'), JSON.stringify(entry));

      const config: PluginConfig = {
        id: 'test',
        command: 'test',
        ttl: 60,
        emoji: '🔧',
        fallbackValue: 'error',
      };
      const result = buildPluginSegment(config, tempDir, defaultOptions);
      expect(result).toBe('🔧 error');
    });

    it('should return fallback when cache is expired', () => {
      mkdirSync(pluginCacheDir, { recursive: true });
      const entry: PluginCacheEntry = {
        value: 'old-value',
        updatedAt: new Date().toISOString(),
        error: null,
      };
      const filePath = join(pluginCacheDir, 'test.json');
      writeFileSync(filePath, JSON.stringify(entry));

      // Backdate the file
      const { utimesSync } = require('node:fs');
      const pastTime = new Date(Date.now() - 120000);
      utimesSync(filePath, pastTime, pastTime);

      const config: PluginConfig = {
        id: 'test',
        command: 'test',
        ttl: 60,
        emoji: '🔧',
        fallbackValue: 'expired',
      };
      // Even with expired cache, we return the stale value (better UX)
      // The background refresh will update it
      const result = buildPluginSegment(config, tempDir, defaultOptions);
      // On expired, we still show fallback for statusline
      expect(result).toBe('🔧 expired');
    });
  });
});
