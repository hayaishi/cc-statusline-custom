/**
 * CLI argument parsing utilities.
 */

/**
 * Parses a valued flag with last-wins semantics.
 *
 * Recognises three forms: `--flag=value`, `--flag value`, `-f value`.
 * A space-separated value is only consumed when the next token does not
 * start with `-`.
 *
 * Returns:
 * - undefined : flag not seen at all
 * - ''        : flag present but no value (end of args or next token is a flag)
 * - string    : the provided value
 */
function parseValuedFlag(args: string[], longFlag: string, shortFlag: string): string | undefined {
  const prefix = longFlag + '=';
  let result: string | undefined = undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === undefined) continue;

    if (arg.startsWith(prefix)) {
      result = arg.slice(prefix.length);
    } else if (arg === longFlag || arg === shortFlag) {
      const next = args[i + 1];
      result = (next !== undefined && !next.startsWith('-')) ? next : '';
    }
  }

  return result;
}

/** Parses --segments / -s.  Last occurrence wins. */
export function parseSegmentsArg(args: string[]): string | undefined {
  return parseValuedFlag(args, '--segments', '-s');
}

/**
 * Checks if --no-emojis flag is present.
 *
 * @param args - CLI arguments
 * @returns true if flag present, undefined otherwise
 */
export function parseNoEmojisArg(args: string[]): boolean | undefined {
  return args.includes('--no-emojis') ? true : undefined;
}

/**
 * Checks if --no-bars flag is present.
 *
 * @param args - CLI arguments
 * @returns true if flag present, undefined otherwise
 */
export function parseNoBarsArg(args: string[]): boolean | undefined {
  return args.includes('--no-bars') ? true : undefined;
}

/**
 * Checks if --disable-bg-update flag is present.
 *
 * @param args - CLI arguments
 * @returns true if flag present, false otherwise
 */
export function parseDisableBgUpdateArg(args: string[]): boolean {
  return args.includes('--disable-bg-update');
}

/**
 * Checks if --auto flag is present.
 *
 * @param args - CLI arguments
 * @returns true if flag present, false otherwise
 */
export function parseAutoArg(args: string[]): boolean {
  return args.includes('--auto');
}

/**
 * Checks if --debug flag is present.
 *
 * @param args - CLI arguments
 * @returns true if flag present, false otherwise
 */
export function parseDebugArg(args: string[]): boolean {
  return args.includes('--debug');
}

/**
 * Parses the --project-dir argument from CLI args.
 * Internal-only: passed to background update subprocesses to propagate workspace.project_dir.
 *
 * @param args - CLI arguments (process.argv.slice(2))
 * @returns Project directory path, or undefined if flag not present or value is empty
 */
export function parseProjectDirArg(args: string[]): string | undefined {
  const idx = args.indexOf('--project-dir');
  if (idx === -1 || idx + 1 >= args.length) return undefined;
  const value = args[idx + 1]?.trim();
  return value === '' ? undefined : value;
}

/** Parses --config / -c.  Last occurrence wins. */
export function parseConfigArg(args: string[]): string | undefined {
  return parseValuedFlag(args, '--config', '-c');
}
