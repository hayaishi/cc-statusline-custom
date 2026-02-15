import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildBackgroundUpdateArgs, loadPlugins } from './index.js';

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

  it('should auto-load plugins when config path is not provided', () => {
    const plugins = loadPlugins(undefined);

    expect(plugins).not.toBeNull();
    expect(plugins?.[0]?.id).toBe('from_env');
  });
});

describe('buildBackgroundUpdateArgs', () => {
  it('should include serialized segments when spawning background update', () => {
    const args = buildBackgroundUpdateArgs(
      '/tmp/script.js',
      ['model', ':git_branch'],
      { debug: false }
    );

    expect(args).toContain('--segments');
    expect(args).toContain('model,:git_branch');
  });

  it('should include all optional parameters when provided', () => {
    const args = buildBackgroundUpdateArgs(
      '/tmp/script.js',
      ['model'],
      {
        debug: true,
        configPath: '/path/to/config.yml',
        projectDir: '/path/to/project',
        ccVersion: '1.2.3',
      }
    );

    expect(args).toContain('--debug');
    expect(args).toContain('--config');
    expect(args).toContain('/path/to/config.yml');
    expect(args).toContain('--project-dir');
    expect(args).toContain('/path/to/project');
    expect(args).toContain('--cc-version');
    expect(args).toContain('1.2.3');
  });

  it('should omit optional parameters when not provided', () => {
    const args = buildBackgroundUpdateArgs(
      '/tmp/script.js',
      [],
      {}
    );

    expect(args).not.toContain('--debug');
    expect(args).not.toContain('--config');
    expect(args).not.toContain('--project-dir');
    expect(args).not.toContain('--cc-version');
    expect(args).not.toContain('--segments');
  });
});
