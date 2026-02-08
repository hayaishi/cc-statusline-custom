import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

export interface PreBashOptions {
  projectDir: string;
  checkScript: string;
  failFlag: string;
  logFile: string;
}

export type CommandRunner = (cmd: string) => Promise<number>;

export function parseCommandFromPayload(payload: string): string {
  try {
    const parsed = JSON.parse(payload) as { tool_input?: { command?: string } };
    return (parsed?.tool_input?.command ?? "").trim();
  } catch {
    return "";
  }
}

/**
 * Detects git boundary commands in bash command strings.
 *
 * Scope (in-scope, guaranteed detection):
 * - Direct git boundary commands: git push, git commit, etc.
 * - Common command chains: npm test && git push
 * - Git global options: git -C repo push, git --git-dir=.git commit
 * - Common wrappers: sudo git push, /usr/bin/git push
 *
 * Non-goals (out-of-scope, not guaranteed):
 * - Complex shell control structures beyond basic chains
 * - Custom wrappers, aliases, or shell functions
 * - Full shell grammar parsing
 *
 * Strong enforcement should be done at git hook and CI layer.
 * This is a best-effort UX guard, not a security boundary.
 */
export function isGitBoundaryCommand(command: string): boolean {
  const boundarySubcommands = ["commit", "push", "merge", "rebase", "cherry-pick", "tag"];

  // Git global options that take an argument
  const optionsWithArgs = ["-C", "-c", "--git-dir", "--work-tree", "--namespace", "--super-prefix"];

  // Split command into segments by common command separators
  const segments = command.split(/(?:&&|\|\||;|\n)+/);

  for (const segment of segments) {
    // Tokenize segment by whitespace and parentheses
    const tokens = segment.trim().split(/[\s()]+/).filter(Boolean);
    if (tokens.length === 0) continue;

    // Skip common command prefixes (sudo, env with args)
    let i = 0;
    if (tokens[i] === "sudo") i++;
    if (tokens[i] === "env") {
      i++;
      // Skip env variable assignments (KEY=VALUE format)
      while (i < tokens.length && tokens[i].includes("=")) i++;
    }

    if (i >= tokens.length) continue;

    // Check if current token is "git" or ends with "/git" (path prefix)
    const executable = tokens[i];
    if (executable !== "git" && !executable.endsWith("/git")) {
      continue; // Not a git command in this segment
    }

    // Skip git global options to find the subcommand
    let j = i + 1;
    while (j < tokens.length) {
      const current = tokens[j];

      if (current.startsWith("-")) {
        // Skip option and its argument if needed
        const needsArg = optionsWithArgs.some(opt => current.startsWith(opt));
        j++;
        if (needsArg && !current.includes("=") && j < tokens.length && !tokens[j].startsWith("-")) {
          j++;
        }
      } else {
        // Found the subcommand - check if it's a boundary command
        if (boundarySubcommands.includes(current)) {
          return true;
        }
        // Non-boundary git command; continue to next segment
        break;
      }
    }
  }

  return false;
}

export function resolvePreBashOptions(
  env: NodeJS.ProcessEnv = process.env,
  cwd: string = process.cwd()
): PreBashOptions {
  const projectDir = env.CLAUDE_PROJECT_DIR || cwd;
  const checkScript = env.CC_CHECK_SCRIPT?.trim() || "check";

  return {
    projectDir,
    checkScript,
    failFlag: path.join(projectDir, ".claude", ".checks_failed"),
    logFile: path.join(projectDir, ".claude", "last-checks.log"),
  };
}

export function defaultRunner(projectDir: string): CommandRunner {
  return (cmdToRun: string) =>
    new Promise((resolve) => {
      const child = spawn(cmdToRun, { cwd: projectDir, shell: true, env: process.env });
      child.on("close", (code) => resolve(code ?? 1));
    });
}

export function readLogTail(logFile: string, tailLines: number): string {
  try {
    const content = fs.readFileSync(logFile, "utf8").split(/\r?\n/);
    return content.slice(-tailLines).join("\n");
  } catch {
    // File may not exist or be unreadable - return empty string for graceful degradation
    return "";
  }
}

function buildBlockedMessage(reason: string, logFile: string): string {
  const tail = readLogTail(logFile, 80);
  return `Blocked: ${reason}\n${tail}\n`;
}

export async function runPreBashGuard(
  payload: string,
  options: PreBashOptions,
  runner: CommandRunner = defaultRunner(options.projectDir)
): Promise<{ exitCode: number; stderr: string }> {
  const command = parseCommandFromPayload(payload);
  if (!isGitBoundaryCommand(command)) {
    return { exitCode: 0, stderr: "" };
  }

  if (fs.existsSync(options.failFlag)) {
    return {
      exitCode: 2,
      stderr: buildBlockedMessage("previous checks failed (.claude/.checks_failed exists).", options.logFile),
    };
  }

  const exitCode = await runner(`npm run ${options.checkScript}`);
  if (exitCode !== 0) {
    return {
      exitCode: 2,
      stderr: buildBlockedMessage("pre-git checks failed. Fix errors then retry.", options.logFile),
    };
  }

  return { exitCode: 0, stderr: "" };
}

export async function main() {
  const payload = fs.readFileSync(0, "utf8") || "{}";
  const options = resolvePreBashOptions();
  const result = await runPreBashGuard(payload, options);
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }
  process.exit(result.exitCode);
}

const isDirectRun = fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? "");
if (isDirectRun) {
  void main();
}
