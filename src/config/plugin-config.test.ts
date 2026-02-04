import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  loadPluginConfig,
  validatePluginConfig,
  parsePluginsFile,
} from './plugin-config.js';
import type { PluginConfig, PluginsFile } from '../types/plugin.js';

describe('plugin-config', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'plugin-config-test-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('loadPluginConfig', () => {
    it('should return null when file does not exist', () => {
      const result = loadPluginConfig('/nonexistent/path.yaml');
      expect(result).toBeNull();
    });

    it('should load valid YAML config file', () => {
      const configPath = join(tempDir, 'plugins.yaml');
      writeFileSync(
        configPath,
        `
plugins:
  - id: test
    command: echo hello
    ttl: 60
`
      );
      const result = loadPluginConfig(configPath);
      expect(result).not.toBeNull();
      expect(result?.plugins).toHaveLength(1);
      expect(result?.plugins[0]?.id).toBe('test');
    });

    it('should load valid YAML config with all optional fields', () => {
      const configPath = join(tempDir, 'plugins.yaml');
      writeFileSync(
        configPath,
        `
plugins:
  - id: git_branch
    command: git branch --show-current
    emoji: "🌿"
    fallbackText: branch
    ttl: 300
    refreshOn: session_start
    timeout: 10000
    workingDir: /home/user
    fallbackValue: "-"
    maxLength: 20
`
      );
      const result = loadPluginConfig(configPath);
      expect(result).not.toBeNull();
      const plugin = result?.plugins[0];
      expect(plugin?.id).toBe('git_branch');
      expect(plugin?.emoji).toBe('🌿');
      expect(plugin?.fallbackText).toBe('branch');
      expect(plugin?.ttl).toBe(300);
      expect(plugin?.refreshOn).toBe('session_start');
      expect(plugin?.timeout).toBe(10000);
      expect(plugin?.workingDir).toBe('/home/user');
      expect(plugin?.fallbackValue).toBe('-');
      expect(plugin?.maxLength).toBe(20);
    });

    it('should return null for invalid YAML syntax', () => {
      const configPath = join(tempDir, 'plugins.yaml');
      writeFileSync(configPath, 'invalid: yaml: syntax: [');
      const result = loadPluginConfig(configPath);
      expect(result).toBeNull();
    });

    it('should return null for empty file', () => {
      const configPath = join(tempDir, 'plugins.yaml');
      writeFileSync(configPath, '');
      const result = loadPluginConfig(configPath);
      expect(result).toBeNull();
    });

    it('should return null for file without plugins array', () => {
      const configPath = join(tempDir, 'plugins.yaml');
      writeFileSync(configPath, 'something: else');
      const result = loadPluginConfig(configPath);
      expect(result).toBeNull();
    });
  });

  describe('validatePluginConfig', () => {
    it('should return valid for correct config', () => {
      const config: PluginConfig = {
        id: 'test',
        command: 'echo hello',
        ttl: 60,
      };
      const result = validatePluginConfig(config);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject empty id', () => {
      const config: PluginConfig = {
        id: '',
        command: 'echo hello',
        ttl: 60,
      };
      const result = validatePluginConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('id must be a non-empty string');
    });

    it('should reject empty command', () => {
      const config: PluginConfig = {
        id: 'test',
        command: '',
        ttl: 60,
      };
      const result = validatePluginConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('command must be a non-empty string');
    });

    it('should reject negative ttl', () => {
      const config: PluginConfig = {
        id: 'test',
        command: 'echo hello',
        ttl: -1,
      };
      const result = validatePluginConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('ttl must be a non-negative number');
    });

    it('should accept ttl of 0', () => {
      const config: PluginConfig = {
        id: 'test',
        command: 'echo hello',
        ttl: 0,
      };
      const result = validatePluginConfig(config);
      expect(result.valid).toBe(true);
    });

    it('should reject timeout exceeding maximum', () => {
      const config: PluginConfig = {
        id: 'test',
        command: 'echo hello',
        ttl: 60,
        timeout: 60000,
      };
      const result = validatePluginConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('timeout must not exceed 30000ms');
    });

    it('should reject negative timeout', () => {
      const config: PluginConfig = {
        id: 'test',
        command: 'echo hello',
        ttl: 60,
        timeout: -100,
      };
      const result = validatePluginConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('timeout must be a positive number');
    });

    it('should reject invalid refreshOn value', () => {
      const config = {
        id: 'test',
        command: 'echo hello',
        ttl: 60,
        refreshOn: 'invalid',
      } as unknown as PluginConfig;
      const result = validatePluginConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('refreshOn must be "session_start" if specified');
    });

    it('should reject non-positive maxLength', () => {
      const config: PluginConfig = {
        id: 'test',
        command: 'echo hello',
        ttl: 60,
        maxLength: 0,
      };
      const result = validatePluginConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('maxLength must be a positive number');
    });

    it('should reject id with invalid characters', () => {
      const config: PluginConfig = {
        id: 'test plugin',
        command: 'echo hello',
        ttl: 60,
      };
      const result = validatePluginConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('id must contain only alphanumeric characters, underscores, and hyphens');
    });

    it('should accept id with underscores and hyphens', () => {
      const config: PluginConfig = {
        id: 'git_branch-test',
        command: 'echo hello',
        ttl: 60,
      };
      const result = validatePluginConfig(config);
      expect(result.valid).toBe(true);
    });
  });

  describe('parsePluginsFile', () => {
    it('should parse valid plugins file', () => {
      const data: PluginsFile = {
        plugins: [
          { id: 'a', command: 'cmd1', ttl: 60 },
          { id: 'b', command: 'cmd2', ttl: 120 },
        ],
      };
      const result = parsePluginsFile(data);
      expect(result.valid).toBe(true);
      expect(result.plugins).toHaveLength(2);
    });

    it('should filter out invalid plugins and report errors', () => {
      const data: PluginsFile = {
        plugins: [
          { id: 'valid', command: 'cmd1', ttl: 60 },
          { id: '', command: 'cmd2', ttl: 120 }, // invalid: empty id
        ],
      };
      const result = parsePluginsFile(data);
      expect(result.valid).toBe(true); // still valid, just filtered
      expect(result.plugins).toHaveLength(1);
      expect(result.plugins[0]?.id).toBe('valid');
      expect(result.errors).toHaveLength(1);
    });

    it('should reject duplicate plugin ids', () => {
      const data: PluginsFile = {
        plugins: [
          { id: 'same', command: 'cmd1', ttl: 60 },
          { id: 'same', command: 'cmd2', ttl: 120 },
        ],
      };
      const result = parsePluginsFile(data);
      expect(result.plugins).toHaveLength(1);
      expect(result.errors.some((e) => e.includes('duplicate'))).toBe(true);
    });

    it('should return empty array for empty plugins list', () => {
      const data: PluginsFile = {
        plugins: [],
      };
      const result = parsePluginsFile(data);
      expect(result.valid).toBe(true);
      expect(result.plugins).toHaveLength(0);
    });

    it('should skip null entries and collect errors', () => {
      const data = {
        plugins: [null, { id: 'valid', command: 'echo hello', ttl: 60 }],
      } as unknown as PluginsFile;
      const result = parsePluginsFile(data);
      expect(result.plugins).toHaveLength(1);
      expect(result.plugins[0]?.id).toBe('valid');
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('expected object');
    });

    it('should skip non-object entries (string, number)', () => {
      const data = {
        plugins: ['not-an-object', 42, { id: 'ok', command: 'echo', ttl: 60 }],
      } as unknown as PluginsFile;
      const result = parsePluginsFile(data);
      expect(result.plugins).toHaveLength(1);
      expect(result.plugins[0]?.id).toBe('ok');
      expect(result.errors).toHaveLength(2);
    });
  });
});
