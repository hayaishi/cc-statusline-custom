/**
 * Plugin configuration file parser and validator.
 *
 * Loads and validates YAML plugin configuration files.
 */

import { readFileSync, existsSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import {
  type PluginConfig,
  type PluginsFile,
  MAX_PLUGIN_TIMEOUT_MS,
  MIN_PLUGIN_TTL_SECONDS,
} from '../types/plugin.js';

/**
 * Result of plugin config validation.
 */
export interface PluginValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

/**
 * Result of parsing a plugins file.
 */
export interface PluginsFileParseResult {
  readonly valid: boolean;
  readonly plugins: readonly PluginConfig[];
  readonly errors: readonly string[];
}

/**
 * Error type for plugin config operations.
 */
export type PluginConfigError = string;

/**
 * Valid characters for plugin IDs: alphanumeric, underscores, hyphens.
 */
const VALID_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

/**
 * Load plugin configuration from a YAML file.
 *
 * @param configPath - Path to the YAML configuration file
 * @returns Parsed plugins file or null if file doesn't exist or is invalid
 */
export function loadPluginConfig(configPath: string): PluginsFile | null {
  if (!existsSync(configPath)) {
    return null;
  }

  try {
    const content = readFileSync(configPath, 'utf-8');
    if (!content.trim()) {
      return null;
    }

    const parsed: unknown = parseYaml(content);
    if (!isPluginsFileShape(parsed)) {
      return null;
    }

    return parsed as PluginsFile;
  } catch {
    return null;
  }
}

/**
 * Check if the parsed object has the expected PluginsFile shape.
 */
function isPluginsFileShape(obj: unknown): boolean {
  if (typeof obj !== 'object' || obj === null) {
    return false;
  }
  const record = obj as Record<string, unknown>;
  return Array.isArray(record.plugins);
}

/**
 * Validate a single plugin configuration.
 *
 * @param config - Plugin configuration to validate
 * @returns Validation result with any errors
 */
export function validatePluginConfig(config: PluginConfig): PluginValidationResult {
  const errors: string[] = [];

  // Required fields
  if (typeof config.id !== 'string' || config.id.length === 0) {
    errors.push('id must be a non-empty string');
  } else if (!VALID_ID_PATTERN.test(config.id)) {
    errors.push('id must contain only alphanumeric characters, underscores, and hyphens');
  }

  if (typeof config.command !== 'string' || config.command.length === 0) {
    errors.push('command must be a non-empty string');
  }

  if (typeof config.ttl !== 'number' || config.ttl < MIN_PLUGIN_TTL_SECONDS) {
    errors.push('ttl must be a non-negative number');
  }

  // Optional fields
  if (config.timeout !== undefined) {
    if (typeof config.timeout !== 'number' || config.timeout <= 0) {
      errors.push('timeout must be a positive number');
    } else if (config.timeout > MAX_PLUGIN_TIMEOUT_MS) {
      errors.push(`timeout must not exceed ${MAX_PLUGIN_TIMEOUT_MS}ms`);
    }
  }

  if (config.refreshOn !== undefined && config.refreshOn !== 'session_start') {
    errors.push('refreshOn must be "session_start" if specified');
  }

  if (config.maxLength !== undefined) {
    if (typeof config.maxLength !== 'number' || config.maxLength <= 0) {
      errors.push('maxLength must be a positive number');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Parse and validate a plugins file, filtering out invalid plugins.
 *
 * @param data - Raw plugins file data
 * @returns Parse result with valid plugins and any errors
 */
export function parsePluginsFile(data: PluginsFile): PluginsFileParseResult {
  const errors: string[] = [];
  const validPlugins: PluginConfig[] = [];
  const seenIds = new Set<string>();

  for (const plugin of data.plugins) {
    const validation = validatePluginConfig(plugin);

    if (!validation.valid) {
      const pluginId = plugin.id || '(unknown)';
      errors.push(`Plugin "${pluginId}": ${validation.errors.join(', ')}`);
      continue;
    }

    if (seenIds.has(plugin.id)) {
      errors.push(`Plugin "${plugin.id}": duplicate id (skipped)`);
      continue;
    }

    seenIds.add(plugin.id);
    validPlugins.push(plugin);
  }

  return {
    valid: true,
    plugins: validPlugins,
    errors,
  };
}
