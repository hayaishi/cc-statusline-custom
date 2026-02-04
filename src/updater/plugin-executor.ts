/**
 * Plugin command executor.
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import {
  PLUGIN_DEFAULTS,
  MAX_PLUGIN_TIMEOUT_MS,
  type PluginConfig,
} from '../types/plugin.js';
import {
  writePluginCache,
  shouldRefreshPlugin,
  CURRENT_SESSION_ID,
} from '../core/plugin-cache.js';

const execAsync = promisify(exec);

export interface PluginCommandResult {
  readonly success: boolean;
  readonly value: string;
  readonly error: string | null;
}

function processOutput(output: string, maxLength: number): string {
  let result = output.trim();
  const newlineIndex = result.indexOf('\n');
  if (newlineIndex !== -1) {
    result = result.substring(0, newlineIndex).trim();
  }
  if (result.length > maxLength) {
    result = result.substring(0, maxLength);
  }
  return result;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    if ('killed' in error && error.killed === true) {
      return 'Command timeout';
    }
    if (error.message.includes('ETIMEDOUT') || error.message.includes('timed out')) {
      return 'Command timeout';
    }
    return error.message;
  }
  return String(error);
}

export async function executePluginCommand(
  config: PluginConfig
): Promise<PluginCommandResult> {
  const timeout = Math.min(config.timeout ?? PLUGIN_DEFAULTS.timeout, MAX_PLUGIN_TIMEOUT_MS);
  const maxLength = config.maxLength ?? PLUGIN_DEFAULTS.maxLength;

  try {
    const { stdout } = await execAsync(config.command, {
      timeout,
      cwd: config.workingDir,
      shell: '/bin/sh',
      maxBuffer: 1024 * 1024,
    });

    return { success: true, value: processOutput(stdout, maxLength), error: null };
  } catch (error: unknown) {
    return { success: false, value: '', error: getErrorMessage(error) };
  }
}

export async function updatePluginCaches(
  configs: readonly PluginConfig[],
  cacheDir: string
): Promise<void> {
  const pluginsToRefresh = configs.filter((config) => shouldRefreshPlugin(config, cacheDir));

  const results = await Promise.all(
    pluginsToRefresh.map(async (config) => {
      const result = await executePluginCommand(config);
      return { config, result };
    })
  );

  for (const { config, result } of results) {
    const sessionId = config.refreshOn === 'session_start' ? CURRENT_SESSION_ID : undefined;
    writePluginCache(config.id, result.value, cacheDir, result.error, sessionId);
  }
}
