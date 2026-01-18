#!/usr/bin/env node

/**
 * ccusage-statusline-custom
 *
 * CLI entry point for Claude Code statusline integration.
 * Reads JSON from stdin, generates statusline, outputs to stdout.
 *
 * Guarantees:
 * - NEVER silent: always outputs exactly one VISIBLE line
 * - Never throws or exits with non-zero code
 * - Responds within 300ms
 */

import { readStdinSync } from './utils/stdin.js';
import { parseInput } from './core/parser.js';
import { generateStatusline, FALLBACK_OUTPUT } from './core/statusline.js';

/**
 * Ensures output is a single visible line.
 * Takes first line only; falls back if empty or whitespace-only.
 */
function ensureVisibleFirstLine(text: string): string {
  const firstLine = text.split('\n')[0] ?? '';
  // If first line is empty or whitespace-only, use fallback
  if (firstLine.trim() === '') {
    return FALLBACK_OUTPUT;
  }
  return firstLine;
}

/**
 * Main entry point.
 * Wrapped in try/catch as ultimate safety net.
 */
function main(): void {
  try {
    const raw = readStdinSync();
    const input = parseInput(raw);
    const line = generateStatusline(input);
    // Print ONLY the first visible line (defense in depth)
    console.log(ensureVisibleFirstLine(line));
  } catch {
    // Ultimate fallback: print visible fallback on any unexpected error
    console.log(FALLBACK_OUTPUT);
  }
}

main();
