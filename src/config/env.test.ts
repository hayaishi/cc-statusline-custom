import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getCacheTtl,
  getSubscriptionCacheTtl,
  getCacheDir,
  getContextLowThreshold,
  getContextMediumThreshold,
  getDebugEnabled,
  getDebugLogPath,
  getDebugLogMaxBytes,
  getDebugLogMaxFiles,
  getSegmentsConfig,
  getEmojisEnabled,
  getBarsEnabled,
  getPluginConfigPath,
} from './env.js';

describe('env config', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Create a fresh copy of process.env for each test
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('getCacheTtl', () => {
    it('returns 60 by default', () => {
      delete process.env.CCSTATUSLINE_CACHE_TTL;
      expect(getCacheTtl()).toBe(60);
    });

    it('parses valid integer values', () => {
      process.env.CCSTATUSLINE_CACHE_TTL = '120';
      expect(getCacheTtl()).toBe(120);
    });

    it('returns default for non-numeric values', () => {
      process.env.CCSTATUSLINE_CACHE_TTL = 'abc';
      expect(getCacheTtl()).toBe(60);
    });

    it('returns default for negative values', () => {
      process.env.CCSTATUSLINE_CACHE_TTL = '-10';
      expect(getCacheTtl()).toBe(60);
    });

    it('returns default for zero', () => {
      process.env.CCSTATUSLINE_CACHE_TTL = '0';
      expect(getCacheTtl()).toBe(60);
    });

    it('handles float values by flooring', () => {
      process.env.CCSTATUSLINE_CACHE_TTL = '45.7';
      expect(getCacheTtl()).toBe(45);
    });
  });

  describe('getSubscriptionCacheTtl', () => {
    it('returns 60 by default', () => {
      delete process.env.CCSTATUSLINE_SUBSCRIPTION_CACHE_TTL;
      expect(getSubscriptionCacheTtl()).toBe(60);
    });

    it('parses valid integer values', () => {
      process.env.CCSTATUSLINE_SUBSCRIPTION_CACHE_TTL = '120';
      expect(getSubscriptionCacheTtl()).toBe(120);
    });

    it('returns default for non-numeric values', () => {
      process.env.CCSTATUSLINE_SUBSCRIPTION_CACHE_TTL = 'abc';
      expect(getSubscriptionCacheTtl()).toBe(60);
    });

    it('returns default for negative values', () => {
      process.env.CCSTATUSLINE_SUBSCRIPTION_CACHE_TTL = '-10';
      expect(getSubscriptionCacheTtl()).toBe(60);
    });

    it('returns default for zero', () => {
      process.env.CCSTATUSLINE_SUBSCRIPTION_CACHE_TTL = '0';
      expect(getSubscriptionCacheTtl()).toBe(60);
    });

    it('handles float values by flooring', () => {
      process.env.CCSTATUSLINE_SUBSCRIPTION_CACHE_TTL = '45.7';
      expect(getSubscriptionCacheTtl()).toBe(45);
    });
  });

  describe('getCacheDir', () => {
    it('returns default path when not set', () => {
      delete process.env.CCSTATUSLINE_CACHE_DIR;
      const result = getCacheDir();
      expect(result).toContain('.cache');
      expect(result).toContain('cc-statusline-custom');
    });

    it('returns custom path when set', () => {
      process.env.CCSTATUSLINE_CACHE_DIR = '/custom/cache/path';
      expect(getCacheDir()).toBe('/custom/cache/path');
    });

    it('trims whitespace', () => {
      process.env.CCSTATUSLINE_CACHE_DIR = '  /custom/path  ';
      expect(getCacheDir()).toBe('/custom/path');
    });
  });

  describe('getContextLowThreshold', () => {
    it('returns 50 by default', () => {
      delete process.env.CCSTATUSLINE_CONTEXT_LOW_THRESHOLD;
      expect(getContextLowThreshold()).toBe(50);
    });

    it('parses valid integer values', () => {
      process.env.CCSTATUSLINE_CONTEXT_LOW_THRESHOLD = '30';
      expect(getContextLowThreshold()).toBe(30);
    });

    it('clamps to 0-100 range (below)', () => {
      process.env.CCSTATUSLINE_CONTEXT_LOW_THRESHOLD = '-10';
      expect(getContextLowThreshold()).toBe(0);
    });

    it('clamps to 0-100 range (above)', () => {
      process.env.CCSTATUSLINE_CONTEXT_LOW_THRESHOLD = '150';
      expect(getContextLowThreshold()).toBe(100);
    });

    it('returns default for non-numeric values', () => {
      process.env.CCSTATUSLINE_CONTEXT_LOW_THRESHOLD = 'invalid';
      expect(getContextLowThreshold()).toBe(50);
    });
  });

  describe('getContextMediumThreshold', () => {
    it('returns 80 by default', () => {
      delete process.env.CCSTATUSLINE_CONTEXT_MEDIUM_THRESHOLD;
      expect(getContextMediumThreshold()).toBe(80);
    });

    it('parses valid integer values', () => {
      process.env.CCSTATUSLINE_CONTEXT_MEDIUM_THRESHOLD = '70';
      expect(getContextMediumThreshold()).toBe(70);
    });

    it('clamps to 0-100 range (below)', () => {
      process.env.CCSTATUSLINE_CONTEXT_MEDIUM_THRESHOLD = '-10';
      expect(getContextMediumThreshold()).toBe(0);
    });

    it('clamps to 0-100 range (above)', () => {
      process.env.CCSTATUSLINE_CONTEXT_MEDIUM_THRESHOLD = '150';
      expect(getContextMediumThreshold()).toBe(100);
    });

    it('returns default for non-numeric values', () => {
      process.env.CCSTATUSLINE_CONTEXT_MEDIUM_THRESHOLD = 'invalid';
      expect(getContextMediumThreshold()).toBe(80);
    });
  });

  describe('getDebugEnabled', () => {
    it('returns false by default', () => {
      delete process.env.CCSTATUSLINE_DEBUG;
      expect(getDebugEnabled()).toBe(false);
    });

    it('returns true when set to "true"', () => {
      process.env.CCSTATUSLINE_DEBUG = 'true';
      expect(getDebugEnabled()).toBe(true);
    });

    it('returns true when set to "1"', () => {
      process.env.CCSTATUSLINE_DEBUG = '1';
      expect(getDebugEnabled()).toBe(true);
    });

    it('returns false for other values', () => {
      process.env.CCSTATUSLINE_DEBUG = 'yes';
      expect(getDebugEnabled()).toBe(false);
    });
  });

  describe('getDebugLogPath', () => {
    it('uses cache dir by default', () => {
      delete process.env.CCSTATUSLINE_DEBUG_LOG_PATH;
      process.env.CCSTATUSLINE_CACHE_DIR = '/tmp/custom-cache';
      expect(getDebugLogPath()).toBe('/tmp/custom-cache/debug/statusline-debug.log');
    });

    it('returns custom path when set', () => {
      process.env.CCSTATUSLINE_DEBUG_LOG_PATH = '/tmp/custom-debug.log';
      expect(getDebugLogPath()).toBe('/tmp/custom-debug.log');
    });

    it('trims whitespace', () => {
      process.env.CCSTATUSLINE_DEBUG_LOG_PATH = '  /tmp/spaced.log  ';
      expect(getDebugLogPath()).toBe('/tmp/spaced.log');
    });
  });

  describe('getDebugLogMaxBytes', () => {
    it('returns default by default', () => {
      delete process.env.CCSTATUSLINE_DEBUG_LOG_MAX_BYTES;
      expect(getDebugLogMaxBytes()).toBe(1024 * 1024);
    });

    it('parses valid values', () => {
      process.env.CCSTATUSLINE_DEBUG_LOG_MAX_BYTES = '4096';
      expect(getDebugLogMaxBytes()).toBe(4096);
    });

    it('returns default for invalid values', () => {
      process.env.CCSTATUSLINE_DEBUG_LOG_MAX_BYTES = 'invalid';
      expect(getDebugLogMaxBytes()).toBe(1024 * 1024);
    });

    it('returns default for zero or negative values', () => {
      process.env.CCSTATUSLINE_DEBUG_LOG_MAX_BYTES = '0';
      expect(getDebugLogMaxBytes()).toBe(1024 * 1024);

      process.env.CCSTATUSLINE_DEBUG_LOG_MAX_BYTES = '-10';
      expect(getDebugLogMaxBytes()).toBe(1024 * 1024);
    });
  });

  describe('getDebugLogMaxFiles', () => {
    it('returns default by default', () => {
      delete process.env.CCSTATUSLINE_DEBUG_LOG_MAX_FILES;
      expect(getDebugLogMaxFiles()).toBe(5);
    });

    it('parses valid values', () => {
      process.env.CCSTATUSLINE_DEBUG_LOG_MAX_FILES = '3';
      expect(getDebugLogMaxFiles()).toBe(3);
    });

    it('returns default for invalid values', () => {
      process.env.CCSTATUSLINE_DEBUG_LOG_MAX_FILES = 'invalid';
      expect(getDebugLogMaxFiles()).toBe(5);
    });

    it('returns default for zero or negative values', () => {
      process.env.CCSTATUSLINE_DEBUG_LOG_MAX_FILES = '0';
      expect(getDebugLogMaxFiles()).toBe(5);

      process.env.CCSTATUSLINE_DEBUG_LOG_MAX_FILES = '-2';
      expect(getDebugLogMaxFiles()).toBe(5);
    });
  });

  describe('ignores legacy env variables', () => {
    const legacyPrefix = ['CC', 'USAGE', '_'].join('');

    it('ignores legacy cache TTL when new var is unset', () => {
      process.env[`${legacyPrefix}CACHE_TTL`] = '999';
      delete process.env.CCSTATUSLINE_CACHE_TTL;
      expect(getCacheTtl()).toBe(60);
    });

    it('ignores legacy subscription cache TTL when new var is unset', () => {
      process.env[`${legacyPrefix}SUBSCRIPTION_CACHE_TTL`] = '999';
      delete process.env.CCSTATUSLINE_SUBSCRIPTION_CACHE_TTL;
      expect(getSubscriptionCacheTtl()).toBe(60);
    });

    it('ignores legacy debug flag when new var is unset', () => {
      process.env[`${legacyPrefix}DEBUG`] = 'true';
      delete process.env.CCSTATUSLINE_DEBUG;
      expect(getDebugEnabled()).toBe(false);
    });
  });

  describe('getSegmentsConfig', () => {
    it('returns undefined when not set', () => {
      delete process.env.CCSTATUSLINE_SEGMENTS;
      expect(getSegmentsConfig()).toBeUndefined();
    });

    it('returns undefined for empty string', () => {
      process.env.CCSTATUSLINE_SEGMENTS = '';
      expect(getSegmentsConfig()).toBeUndefined();
    });

    it('returns undefined for whitespace-only', () => {
      process.env.CCSTATUSLINE_SEGMENTS = '   ';
      expect(getSegmentsConfig()).toBeUndefined();
    });

    it('returns trimmed value when set', () => {
      process.env.CCSTATUSLINE_SEGMENTS = '  model,context  ';
      expect(getSegmentsConfig()).toBe('model,context');
    });

    it('preserves case as-is (normalization happens at parse time)', () => {
      process.env.CCSTATUSLINE_SEGMENTS = 'MODEL,Context';
      expect(getSegmentsConfig()).toBe('MODEL,Context');
    });

    it('returns value with commas and spaces', () => {
      process.env.CCSTATUSLINE_SEGMENTS = 'model, context, cost';
      expect(getSegmentsConfig()).toBe('model, context, cost');
    });
  });

  describe('getEmojisEnabled', () => {
    it('returns true by default', () => {
      delete process.env.CCSTATUSLINE_NO_EMOJIS;
      expect(getEmojisEnabled()).toBe(true);
    });

    it('returns false when NO_EMOJIS=true', () => {
      process.env.CCSTATUSLINE_NO_EMOJIS = 'true';
      expect(getEmojisEnabled()).toBe(false);
    });

    it('returns false when NO_EMOJIS=1', () => {
      process.env.CCSTATUSLINE_NO_EMOJIS = '1';
      expect(getEmojisEnabled()).toBe(false);
    });

    it('returns true for other values', () => {
      process.env.CCSTATUSLINE_NO_EMOJIS = 'false';
      expect(getEmojisEnabled()).toBe(true);

      process.env.CCSTATUSLINE_NO_EMOJIS = '0';
      expect(getEmojisEnabled()).toBe(true);

      process.env.CCSTATUSLINE_NO_EMOJIS = 'yes';
      expect(getEmojisEnabled()).toBe(true);
    });

    it('is case-insensitive', () => {
      process.env.CCSTATUSLINE_NO_EMOJIS = 'TRUE';
      expect(getEmojisEnabled()).toBe(false);

      process.env.CCSTATUSLINE_NO_EMOJIS = 'True';
      expect(getEmojisEnabled()).toBe(false);
    });
  });

  describe('getBarsEnabled', () => {
    it('returns true by default', () => {
      delete process.env.CCSTATUSLINE_NO_BARS;
      expect(getBarsEnabled()).toBe(true);
    });

    it('returns false when NO_BARS=true', () => {
      process.env.CCSTATUSLINE_NO_BARS = 'true';
      expect(getBarsEnabled()).toBe(false);
    });

    it('returns false when NO_BARS=1', () => {
      process.env.CCSTATUSLINE_NO_BARS = '1';
      expect(getBarsEnabled()).toBe(false);
    });

    it('returns true for other values', () => {
      process.env.CCSTATUSLINE_NO_BARS = 'false';
      expect(getBarsEnabled()).toBe(true);

      process.env.CCSTATUSLINE_NO_BARS = '0';
      expect(getBarsEnabled()).toBe(true);

      process.env.CCSTATUSLINE_NO_BARS = 'yes';
      expect(getBarsEnabled()).toBe(true);
    });

    it('is case-insensitive', () => {
      process.env.CCSTATUSLINE_NO_BARS = 'TRUE';
      expect(getBarsEnabled()).toBe(false);

      process.env.CCSTATUSLINE_NO_BARS = 'True';
      expect(getBarsEnabled()).toBe(false);
    });
  });

  describe('getPluginConfigPath', () => {
    it('returns the path when CCSTATUSLINE_PLUGIN_CONFIG is set', () => {
      process.env.CCSTATUSLINE_PLUGIN_CONFIG = '~/.config/plugins.yaml';
      expect(getPluginConfigPath()).toBe('~/.config/plugins.yaml');
    });

    it('returns undefined when not set', () => {
      delete process.env.CCSTATUSLINE_PLUGIN_CONFIG;
      expect(getPluginConfigPath()).toBeUndefined();
    });

    it('returns undefined for empty string', () => {
      process.env.CCSTATUSLINE_PLUGIN_CONFIG = '';
      expect(getPluginConfigPath()).toBeUndefined();
    });

    it('returns undefined for whitespace-only', () => {
      process.env.CCSTATUSLINE_PLUGIN_CONFIG = '   ';
      expect(getPluginConfigPath()).toBeUndefined();
    });

    it('returns trimmed value', () => {
      process.env.CCSTATUSLINE_PLUGIN_CONFIG = '  /etc/plugins.yaml  ';
      expect(getPluginConfigPath()).toBe('/etc/plugins.yaml');
    });
  });
});
