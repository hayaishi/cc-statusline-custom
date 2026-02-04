/**
 * Plugin command executor.
 *
 * Executes shell commands for plugins and manages cache updates.
 */

import { exec, execSync } from 'node:child_process';
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

/**
 * Result of executing a plugin command.
 */
export interface PluginCommandResult {
  readonly success: boolean;
  readonly value: string;
  readonly error: string | null;
}

/**
 * Process command output: trim, take first line, truncate to maxLength.
 */
function processOutput(output: string, maxLength: number): string {
  // Trim whitespace
  let result = output.trim();

  // Take first line only
  const newlineIndex = result.indexOf('\n');
  if (newlineIndex !== -1) {
    result = result.substring(0, newlineIndex).trim();
  }

  // Truncate to maxLength
  if (result.length > maxLength) {
    result = result.substring(0, maxLength);
  }

  return result;
}

/**
 * Get effective timeout for a plugin.
 */
function getEffectiveTimeout(config: PluginConfig): number {
  const timeout = config.timeout ?? PLUGIN_DEFAULTS.timeout;
  return Math.min(timeout, MAX_PLUGIN_TIMEOUT_MS);
}

/**
 * Get effective maxLength for a plugin.
 */
function getEffectiveMaxLength(config: PluginConfig): number {
  return config.maxLength ?? PLUGIN_DEFAULTS.maxLength;
}

/**
 * Execute a plugin command asynchronously.
 *
 * @param config - Plugin configuration
 * @returns Command execution result
 */
export async function executePluginCommand(
  config: PluginConfig
): Promise<PluginCommandResult> {
  const timeout = getEffectiveTimeout(config);
  const maxLength = getEffectiveMaxLength(config);

  try {
    const { stdout } = await execAsync(config.command, {
      timeout,
      cwd: config.workingDir,
      shell: '/bin/sh',
      maxBuffer: 1024 * 1024, // 1MB
    });

    const value = processOutput(stdout, maxLength);

    return {
      success: true,
      value,
      error: null,
    };
  } catch (error: unknown) {
    const errorMessage = getErrorMessage(error);

    return {
      success: false,
      value: '',
      error: errorMessage,
    };
  }
}

/**
 * Execute a plugin command synchronously.
 *
 * @param config - Plugin configuration
 * @returns Command execution result
 */
export function executePluginCommandSync(config: PluginConfig): PluginCommandResult {
  const timeout = getEffectiveTimeout(config);
  const maxLength = getEffectiveMaxLength(config);

  try {
    const stdout = execSync(config.command, {
      timeout,
      cwd: config.workingDir,
      shell: '/bin/sh',
      maxBuffer: 1024 * 1024,
      encoding: 'utf-8',
    });

    const value = processOutput(stdout, maxLength);

    return {
      success: true,
      value,
      error: null,
    };
  } catch (error: unknown) {
    const errorMessage = getErrorMessage(error);

    return {
      success: false,
      value: '',
      error: errorMessage,
    };
  }
}

/**
 * Extract error message from an error object.
 */
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    // Check for timeout
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

/**
 * Update caches for plugins that need refresh.
 *
 * @param configs - Plugin configurations
 * @param cacheDir - Base cache directory
 */
export async function updatePluginCaches(
  configs: readonly PluginConfig[],
  cacheDir: string
): Promise<void> {
  const pluginsToRefresh = configs.filter((config) =>
    shouldRefreshPlugin(config, cacheDir)
  );

  // Execute all plugins in parallel
  const results = await Promise.all(
    pluginsToRefresh.map(async (config) => {
      const result = await executePluginCommand(config);
      return { config, result };
    })
  );

  // Write results to cache
  for (const { config, result } of results) {
    const sessionId = config.refreshOn === 'session_start' ? CURRENT_SESSION_ID : undefined;
    writePluginCache(
      config.id,
      result.value,
      cacheDir,
      result.error,
      sessionId
    );
  }
}
