/**
 * CLI argument parsing utilities.
 */

/**
 * Parses the --segments or -s argument from CLI args.
 *
 * Supports:
 * - `--segments=value`
 * - `--segments value`
 * - `-s value`
 *
 * Uses "last-wins" semantics: if multiple flags are provided, the last one takes precedence.
 *
 * Returns:
 * - undefined: CLI flag not present at all
 * - '': CLI flag present but value missing or next arg is another flag
 * - csv string: valid value provided
 *
 * @param args - CLI arguments (process.argv.slice(2))
 * @returns Segments value, '' if flag present but no valid value, or undefined if flag not present
 */
export function parseSegmentsArg(args: string[]): string | undefined {
  let result: string | undefined = undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === undefined) continue;

    // --segments=value (flag present, may have empty value)
    if (arg.startsWith('--segments=')) {
      result = arg.slice('--segments='.length);
      continue;
    }

    // --segments at end or --segments followed by another flag
    if (arg === '--segments') {
      if (i + 1 >= args.length) {
        // Flag present but no value (at end)
        result = '';
        continue;
      }
      const nextArg = args[i + 1];
      if (nextArg !== undefined && !nextArg.startsWith('-')) {
        result = nextArg;
      } else {
        // Flag present but next arg is another flag
        result = '';
      }
      continue;
    }

    // -s at end or -s followed by another flag
    if (arg === '-s') {
      if (i + 1 >= args.length) {
        // Flag present but no value (at end)
        result = '';
        continue;
      }
      const nextArg = args[i + 1];
      if (nextArg !== undefined && !nextArg.startsWith('-')) {
        result = nextArg;
      } else {
        // Flag present but next arg is another flag
        result = '';
      }
      continue;
    }
  }

  return result;
}
