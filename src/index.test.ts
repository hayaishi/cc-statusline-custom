import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadPlugins } from './index.js';

describe('loadPlugins', () => {
  let tempDir: string;
  let configPath: string;
  let originalPluginConfigEnv: string | undefined;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'load-plugins-test-'));
    configPath = join(tempDir, 'plugins.yml');
    const configContent = [
      'plugins:',
      '  - id: from_env',
      '    command: echo "ok"',
      '    ttl: 60',
      '',
    ].join('\n');
    writeFileSync(configPath, configContent);

    originalPluginConfigEnv = process.env.CCSTATUSLINE_PLUGIN_CONFIG;
    process.env.CCSTATUSLINE_PLUGIN_CONFIG = configPath;
  });

  afterEach(() => {
    if (originalPluginConfigEnv === undefined) {
      delete process.env.CCSTATUSLINE_PLUGIN_CONFIG;
    } else {
      process.env.CCSTATUSLINE_PLUGIN_CONFIG = originalPluginConfigEnv;
    }
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should return null when context is update and config path is not provided', () => {
    const plugins = loadPlugins(undefined, 'update');

    expect(plugins).toBeNull();
  });

  it('should auto-load plugins when context is statusline and config path is not provided', () => {
    const plugins = loadPlugins(undefined, 'statusline');

    expect(plugins).not.toBeNull();
    expect(plugins?.[0]?.id).toBe('from_env');
  });

  it('should auto-load plugins when context is not provided', () => {
    const plugins = loadPlugins(undefined);

    expect(plugins).not.toBeNull();
    expect(plugins?.[0]?.id).toBe('from_env');
  });
});
