import { describe, it, expect } from 'vitest';
import {
  PLUGIN_DEFAULTS,
  MAX_PLUGIN_TIMEOUT_MS,
  MIN_PLUGIN_TTL_SECONDS,
  PLUGIN_CACHE_DIR_NAME,
  type PluginConfig,
  type PluginsFile,
  type PluginCacheEntry,
  type PluginRefreshOn,
} from './plugin.js';

describe('plugin types', () => {
  describe('PLUGIN_DEFAULTS', () => {
    it('should have correct default timeout', () => {
      expect(PLUGIN_DEFAULTS.timeout).toBe(5000);
    });

    it('should have correct default fallbackValue', () => {
      expect(PLUGIN_DEFAULTS.fallbackValue).toBe('…');
    });

    it('should have correct default maxLength', () => {
      expect(PLUGIN_DEFAULTS.maxLength).toBe(32);
    });
  });

  describe('constants', () => {
    it('should have MAX_PLUGIN_TIMEOUT_MS set to 30 seconds', () => {
      expect(MAX_PLUGIN_TIMEOUT_MS).toBe(30000);
    });

    it('should have MIN_PLUGIN_TTL_SECONDS set to 0', () => {
      expect(MIN_PLUGIN_TTL_SECONDS).toBe(0);
    });

    it('should have PLUGIN_CACHE_DIR_NAME set to plugins', () => {
      expect(PLUGIN_CACHE_DIR_NAME).toBe('plugins');
    });
  });

  describe('type structure validation', () => {
    it('should allow valid PluginConfig with required fields only', () => {
      const config: PluginConfig = {
        id: 'test',
        command: 'echo hello',
        ttl: 60,
      };
      expect(config.id).toBe('test');
      expect(config.command).toBe('echo hello');
      expect(config.ttl).toBe(60);
    });

    it('should allow valid PluginConfig with all optional fields', () => {
      const config: PluginConfig = {
        id: 'test',
        command: 'echo hello',
        ttl: 60,
        emoji: '🔧',
        alt: 'test',
        refreshOn: 'session_start',
        timeout: 10000,
        workingDir: '/tmp',
        fallbackValue: 'N/A',
        maxLength: 20,
      };
      expect(config.emoji).toBe('🔧');
      expect(config.refreshOn).toBe('session_start');
    });

    it('should allow valid PluginsFile', () => {
      const file: PluginsFile = {
        plugins: [
          { id: 'a', command: 'cmd1', ttl: 60 },
          { id: 'b', command: 'cmd2', ttl: 120 },
        ],
      };
      expect(file.plugins).toHaveLength(2);
    });

    it('should allow valid PluginCacheEntry', () => {
      const entry: PluginCacheEntry = {
        value: 'output',
        updatedAt: '2024-01-01T00:00:00.000Z',
        error: null,
        sessionId: 'session-123',
      };
      expect(entry.value).toBe('output');
      expect(entry.error).toBeNull();
    });

    it('should allow PluginCacheEntry with error', () => {
      const entry: PluginCacheEntry = {
        value: '',
        updatedAt: '2024-01-01T00:00:00.000Z',
        error: 'Command failed',
      };
      expect(entry.error).toBe('Command failed');
    });

    it('should allow refreshOn to be session_start', () => {
      const refreshOn: PluginRefreshOn = 'session_start';
      expect(refreshOn).toBe('session_start');
    });
  });
});
