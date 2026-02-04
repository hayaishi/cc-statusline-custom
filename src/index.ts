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
import {
  parseSegmentsArg,
  parseNoEmojisArg,
  parseNoBarsArg,
  parseDisableBgUpdateArg,
  parseAutoArg,
  parseDebugArg,
  parseConfigArg,
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
import { getCacheDir, getPluginConfigPath } from './config/env.js';
import { loadPluginConfig, parsePluginsFile } from './config/plugin-config.js';
import { shouldRefreshPlugin } from './core/plugin-cache.js';
import { updatePluginCaches } from './updater/plugin-executor.js';
import type { PluginConfig } from './types/plugin.js';

const CACHE_FALLBACK_OUTPUT = 'Cache update failed';

function loadPlugins(configPath: string | undefined): readonly PluginConfig[] | null {
  // CLI > ENV > (no default: plugin config is opt-in)
  const effectivePath = configPath || getPluginConfigPath();
  if (!effectivePath) return null;

  const expandedPath = effectivePath.replace(/^~/, process.env.HOME ?? '');
  const pluginsFile = loadPluginConfig(expandedPath);
  if (!pluginsFile) return null;

  const parsed = parsePluginsFile(pluginsFile);
  return parsed.plugins.length > 0 ? parsed.plugins : null;
}

function createPluginConfigMap(plugins: readonly PluginConfig[] | null): PluginConfigMap | undefined {
  if (!plugins || plugins.length === 0) return undefined;
  return new Map(plugins.map(p => [p.id, p]));
}

/**
 * Ensures output is a single visible line.
 * Takes first line only; falls back if empty or whitespace-only.
 */
function ensureVisibleFirstLine(text: string, fallback: string = FALLBACK_OUTPUT): string {
  const firstLine = text.split('\n')[0] ?? '';
  if (firstLine.trim() === '') {
    return fallback;
  }
  return firstLine;
}

/** Handles the --update-cache subcommand. */
async function handleUpdateCache(args: string[]): Promise<void> {
  try {
    const isAuto = parseAutoArg(args);
    const isDebug = parseDebugArg(args);
    const configPath = parseConfigArg(args);

    const { updateCache } = await import('./updater/update-cache.js');
    const result = await updateCache(undefined, { mode: isAuto ? 'auto' : 'force', debug: isDebug });

    const plugins = loadPlugins(configPath);
    if (plugins !== null) {
      await tryUpdatePluginCaches(plugins);
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
 */
function trySpawnBackgroundUpdate(
  segments: readonly SegmentId[],
  isBgUpdateDisabled: boolean,
  debug: boolean,
  configPath?: string
): void {
  try {
    if (isBgUpdateDisabled) return;

    // Prevent recursive spawning: child sets this env var before re-entering
    if (process.env.CCSTATUSLINE_BG_UPDATE === '1') return;

    const cacheDir = getCacheDir();
    if (!shouldRequestBgCacheUpdate(cacheDir, segments)) return;

    const scriptPath = process.argv[1];
    if (scriptPath === undefined || scriptPath === '') return;

    const args = [scriptPath, '--update-cache', '--auto'];
    if (debug) {
      args.push('--debug');
    }
    if (configPath !== undefined && configPath !== '') {
      args.push('--config', configPath);
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
    child.unref();
  } catch {
    // best-effort: background update must never crash the statusline
  }
}

async function tryUpdatePluginCaches(plugins: readonly PluginConfig[] | null): Promise<void> {
  if (!plugins || plugins.length === 0) return;

  const cacheDir = getCacheDir();
  const pluginsNeedingRefresh = plugins.filter(p => shouldRefreshPlugin(p, cacheDir));
  if (pluginsNeedingRefresh.length > 0) {
    await updatePluginCaches(pluginsNeedingRefresh, cacheDir);
  }
}

/**
 * Handles the statusline generation (default mode).
 * Always reads from cache — never blocks on network or subprocess.
 */
function handleStatusline(args: string[]): void {
  try {
    const raw = readStdinSync();
    const input = parseInput(raw);

    const segmentsArg = parseSegmentsArg(args);
    const noEmojisCli = parseNoEmojisArg(args);
    const noBarsCli = parseNoBarsArg(args);
    const isBgUpdateDisabled = parseDisableBgUpdateArg(args);
    const debug = parseDebugArg(args);
    const configPath = parseConfigArg(args);

    const segmentOrder = resolveSegmentOrder(segmentsArg);
    const renderOptions = resolveRenderOptions(noEmojisCli, noBarsCli);

    const plugins = loadPlugins(configPath);
    const pluginConfigMap = createPluginConfigMap(plugins);

    const line = generateStatusline(input, getCacheDir(), segmentOrder, renderOptions, debug, pluginConfigMap);

    // Defense in depth: extract first line even if generateStatusline misbehaves
    console.log(ensureVisibleFirstLine(line));

    // Spawn after printing to keep the hot path as short as possible
    trySpawnBackgroundUpdate(segmentOrder, isBgUpdateDisabled, debug, configPath);
  } catch {
    // Ultimate fallback: guarantee at least one visible line on any error
    console.log(FALLBACK_OUTPUT);
  }
}

/** Main entry point. */
async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes('--update-cache')) {
    await handleUpdateCache(args);
  } else {
    handleStatusline(args);
  }
}

void main();
