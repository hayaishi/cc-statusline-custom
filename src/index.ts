#!/usr/bin/env node

/**
 * ccusage-statusline-custom
 *
 * CLI entry point for Claude Code statusline integration.
 * Reads JSON from stdin, generates statusline, outputs to stdout.
 *
 * Output format:
 * 🤖 <Model> | 💰 $<session> sess | 🧠 <used>k/<limit>k [████░░░░] <pct>% | ⌛️ <pct>% [████░░░░] (~h:mmam/pm)
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
import { parseSegmentsArg, parseNoEmojisArg, parseNoBarsArg, parseDisableBgUpdateArg, parseAutoArg, parseDebugArg } from './utils/cli-args.js';
import { parseInput } from './core/parser.js';
import { generateStatusline, FALLBACK_OUTPUT, resolveSegmentOrder, resolveRenderOptions, shouldRequestBgCacheUpdate, type SegmentId } from './core/statusline.js';
import { getCacheDir } from './config/env.js';

/**
 * Fallback output for cache update operations.
 */
const CACHE_FALLBACK_OUTPUT = 'Cache update failed';

/**
 * Ensures output is a single visible line.
 * Takes first line only; falls back if empty or whitespace-only.
 */
function ensureVisibleFirstLine(text: string, fallback: string = FALLBACK_OUTPUT): string {
  const firstLine = text.split('\n')[0] ?? '';
  // If first line is empty or whitespace-only, use fallback
  if (firstLine.trim() === '') {
    return fallback;
  }
  return firstLine;
}

/**
 * Handles the --update-cache subcommand.
 * Updates subscription usage cache and outputs result.
 */
async function handleUpdateCache(args: string[]): Promise<void> {
  try {
    const isAuto = parseAutoArg(args);
    const isDebug = parseDebugArg(args);
    const { updateCache } = await import('./updater/update-cache.js');
    const result = await updateCache(undefined, { mode: isAuto ? 'auto' : 'force', debug: isDebug });
    // Always output a visible single line
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
 * @param disabled - Whether background update is disabled via CLI flag
 */
function trySpawnBackgroundUpdate(
  segments: readonly SegmentId[],
  disabled: boolean,
  debug: boolean
): void {
  try {
    // Skip if disabled by flag
    if (disabled) return;

    // Skip if already in background update context (recursion guard)
    if (process.env.CCSTATUSLINE_BG_UPDATE === '1') return;

    // Check if update is needed based on segments and cache state
    const cacheDir = getCacheDir();
    if (!shouldRequestBgCacheUpdate(cacheDir, segments)) return;

    // Get the script path (process.argv[1] is always defined for Node.js scripts)
    const scriptPath = process.argv[1];
    if (scriptPath === undefined || scriptPath === '') return;

    const args = [scriptPath, '--update-cache', '--auto'];
    if (debug) {
      args.push('--debug');
    }

    // Spawn detached background process
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
    // Never throw - background update is best-effort
  }
}

/**
 * Handles the statusline generation (default mode).
 * Reads JSON from stdin, generates statusline, outputs to stdout.
 *
 * Always reads from cache when available for subscription usage.
 *
 * @param args - CLI arguments
 */
function handleStatusline(args: string[]): void {
  try {
    const raw = readStdinSync();
    const input = parseInput(raw);

    // Parse CLI flags
    const segmentsArg = parseSegmentsArg(args);
    const noEmojisCli = parseNoEmojisArg(args);
    const noBarsCli = parseNoBarsArg(args);
    const disableBgUpdate = parseDisableBgUpdateArg(args);
    const debug = parseDebugArg(args);

    // Resolve configuration
    const segmentOrder = resolveSegmentOrder(segmentsArg);
    const renderOptions = resolveRenderOptions(noEmojisCli, noBarsCli);

    // Generate statusline (reads cache for subscription usage)
    const line = generateStatusline(input, getCacheDir(), segmentOrder, renderOptions, debug);

    // Print ONLY the first visible line (defense in depth)
    console.log(ensureVisibleFirstLine(line));

    // Attempt background update if needed (never throws, never blocks)
    // Spawn after printing to keep the statusline output path as short as possible
    trySpawnBackgroundUpdate(segmentOrder, disableBgUpdate, debug);
  } catch {
    // Ultimate fallback: print visible fallback on any unexpected error
    console.log(FALLBACK_OUTPUT);
  }
}

/**
 * Main entry point.
 * Parses arguments and dispatches to appropriate handler.
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes('--update-cache')) {
    await handleUpdateCache(args);
  } else {
    handleStatusline(args);
  }
}

void main();
