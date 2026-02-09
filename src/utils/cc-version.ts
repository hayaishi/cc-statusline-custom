import { execSync } from 'node:child_process';

/**
 * Detects the current Claude Code version by executing `claude --version`.
 *
 * @returns The version string (e.g., "2.1.37") or null if detection fails
 */
export function detectClaudeCodeVersion(): string | null {
  try {
    const output = execSync('claude --version', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
      timeout: 5000,
    });

    const trimmed = output.trim();
    if (trimmed === '') {
      return null;
    }

    // Extract semver pattern from output like "2.1.37 (Claude Code)"
    // Supports: major.minor.patch, major.minor, prerelease tags, build metadata
    const match = /^(\d+\.\d+(?:\.\d+)?(?:-[\w.]+)?(?:\+[\w.]+)?)/.exec(trimmed);
    if (match?.[1] === undefined) {
      return null;
    }

    return match[1];
  } catch {
    return null;
  }
}
