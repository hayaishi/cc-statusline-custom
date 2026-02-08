import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

export interface PreBashOptions {
  projectDir: string;
  preferCheckScript: string;
  fallbackScript: string;
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

export function isGitBoundaryCommand(command: string): boolean {
  return /^git\s+(commit|push|merge|rebase|cherry-pick|tag)(\s|$)/.test(command);
}

export function resolvePreBashOptions(
  env: NodeJS.ProcessEnv = process.env,
  cwd: string = process.cwd()
): PreBashOptions {
  const projectDir = env.CLAUDE_PROJECT_DIR || cwd;
  const preferCheckScript = env.CC_CHECK_SCRIPT?.trim() || "check";
  const fallbackScript = "check:all";

  return {
    projectDir,
    preferCheckScript,
    fallbackScript,
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
    return "";
  }
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

  // Block immediately if previous checks failed
  if (fs.existsSync(options.failFlag)) {
    const tail = readLogTail(options.logFile, 80);
    return {
      exitCode: 2,
      stderr: `Blocked: previous checks failed (.claude/.checks_failed exists).\n${tail}\n`,
    };
  }

  let exitCode = await runner(`npm run ${options.preferCheckScript}`);

  // Try fallback if primary check failed and fallback differs
  if (exitCode !== 0 && options.preferCheckScript !== options.fallbackScript) {
    exitCode = await runner(`npm run ${options.fallbackScript}`);
  }

  if (exitCode !== 0) {
    const tail = readLogTail(options.logFile, 80);
    return {
      exitCode: 2,
      stderr: `Blocked: pre-git checks failed. Fix errors then retry.\n${tail}\n`,
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
