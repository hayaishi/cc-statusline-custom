#!/usr/bin/env node

/**
 * ccusage-statusline-custom
 *
 * CLI entry point for Claude Code statusline integration.
 * Reads JSON from stdin, generates statusline, outputs to stdout.
 *
 * Output format (legacy parity):
 * 🤖 <Model> | 💰 $<session> sess / $<today> today / $<block> (<left>) | 🔥 $<rate>/hr | 🧠 <used>k/<limit>k [████░░░░] <pct>%
 *
 * Guarantees:
 * - NEVER silent: always outputs exactly one VISIBLE line
 * - Never throws or exits with non-zero code
 * - Responds within 300ms
 *
 * Subcommands:
 * - --update-cache: Update the extended metrics cache (run periodically)
 */

import { readStdinSync } from './utils/stdin.js';
import { parseInput } from './core/parser.js';
import { generateStatusline, FALLBACK_OUTPUT } from './core/statusline.js';
import { updateCache } from './core/cache-updater.js';
import { getCacheDir, getCacheTtl } from './config/env.js';

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
 * Updates extended metrics cache and outputs result.
 */
function handleUpdateCache(): void {
  try {
    const result = updateCache();
    // Always output a visible single line
    const output = result.success ? result.message : `Error: ${result.message}`;
    console.log(ensureVisibleFirstLine(output, CACHE_FALLBACK_OUTPUT));
  } catch {
    console.log(CACHE_FALLBACK_OUTPUT);
  }
}

/**
 * Handles the statusline generation (default mode).
 * Reads JSON from stdin, generates statusline, outputs to stdout.
 *
 * Always reads from cache when available for extended metrics
 * (daily total, block info, burn rate).
 */
function handleStatusline(): void {
  try {
    const raw = readStdinSync();
    const input = parseInput(raw);

    // Generate statusline (always reads cache for extended metrics)
    const line = generateStatusline(input, getCacheDir(), getCacheTtl());

    // Print ONLY the first visible line (defense in depth)
    console.log(ensureVisibleFirstLine(line));
  } catch {
    // Ultimate fallback: print visible fallback on any unexpected error
    console.log(FALLBACK_OUTPUT);
  }
}

/**
 * Main entry point.
 * Parses arguments and dispatches to appropriate handler.
 */
function main(): void {
  const args = process.argv.slice(2);

  if (args.includes('--update-cache')) {
    handleUpdateCache();
  } else {
    handleStatusline();
  }
}

main();
