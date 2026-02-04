/**
 * Plugin configuration file parser and validator.
 */

import { readFileSync, existsSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import {
  type PluginConfig,
  type PluginsFile,
  MAX_PLUGIN_TIMEOUT_MS,
  MIN_PLUGIN_TTL_SECONDS,
} from '../types/plugin.js';

export interface PluginValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

export interface PluginsFileParseResult {
  readonly valid: boolean;
  readonly plugins: readonly PluginConfig[];
  readonly errors: readonly string[];
}

const VALID_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

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
    if (typeof parsed !== 'object' || parsed === null) {
      return null;
    }
    const record = parsed as Record<string, unknown>;
    if (!Array.isArray(record.plugins)) {
      return null;
    }

    return parsed as PluginsFile;
  } catch {
    return null;
  }
}

export function validatePluginConfig(config: PluginConfig): PluginValidationResult {
  const errors: string[] = [];

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

  return { valid: errors.length === 0, errors };
}

export function parsePluginsFile(data: PluginsFile): PluginsFileParseResult {
  const errors: string[] = [];
  const validPlugins: PluginConfig[] = [];
  const seenIds = new Set<string>();

  for (const plugin of data.plugins) {
    const validation = validatePluginConfig(plugin);
    if (!validation.valid) {
      errors.push(`Plugin "${plugin.id || '(unknown)'}": ${validation.errors.join(', ')}`);
      continue;
    }

    if (seenIds.has(plugin.id)) {
      errors.push(`Plugin "${plugin.id}": duplicate id (skipped)`);
      continue;
    }

    seenIds.add(plugin.id);
    validPlugins.push(plugin);
  }

  return { valid: true, plugins: validPlugins, errors };
}
