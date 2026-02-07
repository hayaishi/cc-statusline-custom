import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import {
  PLUGIN_DEFAULTS,
  MAX_PLUGIN_TIMEOUT_MS,
  type PluginConfig,
} from '../types/plugin.js';
import { writePluginCache, CURRENT_SESSION_ID } from '../core/plugin-cache.js';

const execAsync = promisify(exec);

export interface PluginCommandResult {
  readonly success: boolean;
  readonly value: string;
  readonly error: string | null;
}

function normalizeOutput(output: string, maxLength: number): string {
  const firstLine = output.trim().split('\n')[0] ?? '';
  return firstLine.trim().substring(0, maxLength);
}

function extractErrorMessage(error: unknown): string {
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
  config: PluginConfig,
  projectDir?: string
): Promise<PluginCommandResult> {
  const timeout = Math.min(config.timeout ?? PLUGIN_DEFAULTS.timeout, MAX_PLUGIN_TIMEOUT_MS);
  const maxLength = config.maxLength ?? PLUGIN_DEFAULTS.maxLength;

  try {
    const { stdout } = await execAsync(config.command, {
      timeout,
      cwd: config.workingDir ?? projectDir,
      shell: '/bin/sh',
      maxBuffer: 1024 * 1024,
    });

    return { success: true, value: normalizeOutput(stdout, maxLength), error: null };
  } catch (error: unknown) {
    return { success: false, value: '', error: extractErrorMessage(error) };
  }
}

export async function updatePluginCaches(
  configs: readonly PluginConfig[],
  cacheDir: string,
  projectDir?: string
): Promise<void> {
  const results = await Promise.all(
    configs.map(async (config) => {
      const result = await executePluginCommand(config, projectDir);
      return { config, result };
    })
  );

  for (const { config, result } of results) {
    const sessionId = config.refreshOn === 'session_start' ? CURRENT_SESSION_ID : undefined;
    const effectiveWorkingDir = config.workingDir ?? projectDir;
    writePluginCache(config.id, result.value, cacheDir, result.error, sessionId, effectiveWorkingDir);
  }
}
