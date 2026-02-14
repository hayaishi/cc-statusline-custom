#!/usr/bin/env node

/**
 * cc-statusline-custom
 *
 * CLI entry point for Claude Code statusline integration.
 * Reads JSON from stdin, generates statusline, outputs to stdout.
 *
 * Output format:
 * 🤖 <Model> | 💰 $<session> | 🧠 <used>k/<limit>k [████░░░░] <pct>% | ⌛️ <pct>% [████░░░░] (~h:mmam/pm)
 *
 * Guarantees:
 * - NEVER silent: always outputs exactly one VISIBLE line
 * - Never throws or exits with non-zero code
 * - Responds within 300ms
 *
 * Subcommands:
 * - --update-cache: Update the subscription usage cache (run periodically)
 */

import { spawn } from 'node:child_process';
import { readStdinSync } from './utils/stdin.js';
import { detectClaudeCodeVersion } from './utils/cc-version.js';
import {
  parseSegmentsArg,
  parseNoEmojisArg,
  parseNoBarsArg,
  parseDisableBgUpdateArg,
  parseAutoArg,
  parseDebugArg,
  parseConfigArg,
  parseProjectDirArg,
  parseCcVersionArg,
} from './utils/cli-args.js';
import { parseInput } from './core/parser.js';
import {
  generateStatusline,
  FALLBACK_OUTPUT,
  resolveSegmentOrder,
  resolveRenderOptions,
  shouldRequestBgCacheUpdate,
  type SegmentId,
  type PluginConfigMap,
} from './core/statusline.js';
import {
  getCacheDir,
  getDebugEnabled,
  getDebugLogMaxBytes,
  getDebugLogMaxFiles,
  getDebugLogPath,
  getPluginConfigPath,
} from './config/env.js';
import { loadPluginConfig, parsePluginsFile } from './config/plugin-config.js';
import { shouldRefreshPlugin } from './core/plugin-cache.js';
import { updatePluginCaches } from './updater/plugin-executor.js';
import { writeDebugLog } from './utils/debug-log.js';
import type { DebugLogOptions } from './utils/debug-log.js';
import type { PluginConfig } from './types/plugin.js';

const CACHE_FALLBACK_OUTPUT = 'Cache update failed';

function isDebugModeEnabled(args: string[]): boolean {
  return parseDebugArg(args) || getDebugEnabled();
}

function createDebugLogOptions(enabled: boolean): DebugLogOptions {
  return {
    enabled,
    filePath: getDebugLogPath(),
    maxBytes: getDebugLogMaxBytes(),
    maxFiles: getDebugLogMaxFiles(),
  };
}

function loadPlugins(configPath: string | undefined): readonly PluginConfig[] | null {
  const effectivePath = configPath ?? getPluginConfigPath();
  if (effectivePath === undefined) return null;

  const expandedPath = effectivePath.replace(/^~/, process.env.HOME ?? '');
  const pluginsFile = loadPluginConfig(expandedPath);
  if (pluginsFile === null) return null;

  const { plugins } = parsePluginsFile(pluginsFile);
  return plugins.length > 0 ? plugins : null;
}

function createPluginConfigMap(plugins: readonly PluginConfig[] | null): PluginConfigMap | undefined {
  if (plugins === null || plugins.length === 0) {
    return undefined;
  }
  return new Map(plugins.map(plugin => [plugin.id, plugin]));
}

/**
 * Ensures output is a single visible line.
 * Takes first line only; falls back if empty or whitespace-only.
 */
function ensureVisibleFirstLine(text: string, fallback: string = FALLBACK_OUTPUT): string {
  const firstLine = text.split('\n')[0] ?? '';
  const trimmed = firstLine.trim();
  if (trimmed === '') return fallback;
  return firstLine;
}

/** Handles the --update-cache subcommand. */
async function handleUpdateCache(args: string[]): Promise<void> {
  try {
    const isAuto = parseAutoArg(args);
    const isDebug = isDebugModeEnabled(args);
    const configPath = parseConfigArg(args);
    const projectDir = parseProjectDirArg(args);
    const ccVersion = parseCcVersionArg(args) ?? detectClaudeCodeVersion() ?? undefined;

    const { updateCache } = await import('./updater/update-cache.js');
    const options: Parameters<typeof updateCache>[1] = {
      mode: isAuto ? 'auto' : 'force',
      debug: isDebug,
      ...(ccVersion !== undefined && { ccVersion }),
    };
    const result = await updateCache(undefined, options);

    const plugins = loadPlugins(configPath);
    if (plugins !== null) {
      await tryUpdatePluginCaches(plugins, projectDir);
    }

    const output = result.success ? result.message : `Error: ${result.message}`;
    console.log(ensureVisibleFirstLine(output, CACHE_FALLBACK_OUTPUT));
  } catch {
    console.log(CACHE_FALLBACK_OUTPUT);
  }
}

/**
 * Attempts to spawn a background cache update process if needed.
 * Never throws and never blocks the statusline output.
 *
 * @param segments - Array of segment identifiers
 * @param isBgUpdateDisabled - Whether background update is disabled via CLI flag
 * @param configPath - Path to plugin config file for passing to subprocess
 * @param plugins - Loaded plugin configurations
 * @param projectDir - Project directory for scoped plugin caches
 * @param ccVersion - Claude Code version to pass to subprocess
 */
function trySpawnBackgroundUpdate(
  segments: readonly SegmentId[],
  isBgUpdateDisabled: boolean,
  debug: boolean,
  configPath?: string,
  plugins?: readonly PluginConfig[],
  projectDir?: string,
  ccVersion?: string
): void {
  try {
    if (isBgUpdateDisabled) return;

    // Prevent recursive spawning: child sets this env var before re-entering
    if (process.env.CCSTATUSLINE_BG_UPDATE === '1') return;

    const cacheDir = getCacheDir();
    const options: Parameters<typeof shouldRequestBgCacheUpdate>[2] = {
      ...(plugins !== undefined && { plugins }),
      ...(projectDir !== undefined && { projectDir }),
    };
    if (!shouldRequestBgCacheUpdate(cacheDir, segments, options)) return;

    const scriptPath = process.argv[1];
    if (scriptPath === undefined || scriptPath === '') return;

    const args = [scriptPath, '--update-cache', '--auto'];
    if (debug) {
      args.push('--debug');
    }
    if (configPath !== undefined) {
      args.push('--config', configPath);
    }
    if (projectDir !== undefined) {
      args.push('--project-dir', projectDir);
    }
    if (ccVersion !== undefined) {
      args.push('--cc-version', ccVersion);
    }

    const child = spawn(
      process.execPath,
      args,
      {
        detached: true,
        stdio: 'ignore' as const,
        env: { ...process.env, CCSTATUSLINE_BG_UPDATE: '1' },
      }
    );
    child.on('error', () => {
      // Swallow async spawn errors (EAGAIN, EMFILE, etc.)
      // to prevent unhandled 'error' events from crashing the process.
    });
    child.unref();
  } catch {
    // best-effort: background update must never crash the statusline
  }
}

async function tryUpdatePluginCaches(plugins: readonly PluginConfig[], projectDir?: string): Promise<void> {
  const cacheDir = getCacheDir();
  const stale = plugins.filter(plugin => shouldRefreshPlugin(plugin, cacheDir, plugin.workingDir ?? projectDir));
  if (stale.length > 0) {
    await updatePluginCaches(stale, cacheDir, projectDir);
  }
}

/**
 * Handles the statusline generation (default mode).
 * Always reads from cache — never blocks on network or subprocess.
 */
function handleStatusline(args: string[]): void {
  try {
    const debug = isDebugModeEnabled(args);
    const raw = readStdinSync();
    writeDebugLog('statusline.stdin', {
      body: raw,
    }, createDebugLogOptions(debug));

    const input = parseInput(raw);

    const segmentsArg = parseSegmentsArg(args);
    const noEmojisCli = parseNoEmojisArg(args);
    const noBarsCli = parseNoBarsArg(args);
    const isBgUpdateDisabled = parseDisableBgUpdateArg(args);
    const configPath = parseConfigArg(args);

    const segmentOrder = resolveSegmentOrder(segmentsArg);
    const renderOptions = resolveRenderOptions(noEmojisCli, noBarsCli);

    const plugins = loadPlugins(configPath);
    const pluginConfigMap = createPluginConfigMap(plugins);

    const projectDir = input?.workspace?.project_dir;
    const ccVersion = input?.version;
    const line = generateStatusline(input, getCacheDir(), segmentOrder, renderOptions, debug, pluginConfigMap, projectDir);

    // Defense in depth: extract first line even if generateStatusline misbehaves
    console.log(ensureVisibleFirstLine(line));

    // Spawn after printing to keep the hot path as short as possible
    trySpawnBackgroundUpdate(segmentOrder, isBgUpdateDisabled, debug, configPath, plugins ?? undefined, projectDir, ccVersion);
  } catch {
    // Ultimate fallback: guarantee at least one visible line on any error
    console.log(FALLBACK_OUTPUT);
  }
}

/** Main entry point. */
async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // Load experimental subscription-usage module if available
  try {
    const { registerSubscriptionSegments } = await import('./experimental/subscription-usage/index.js');
    registerSubscriptionSegments();
  } catch {
    // Module not available - subscription segments won't be registered
  }

  if (args.includes('--update-cache')) {
    await handleUpdateCache(args);
  } else {
    handleStatusline(args);
  }
}

void main();
