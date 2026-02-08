import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

export interface PostEditOptions {
  projectDir: string;
  preferCheckScript: string;
  fallbackScript: string;
  logFile: string;
}

export type CommandRunner = (cmd: string) => Promise<number>;

export function resolvePostEditOptions(
  env: NodeJS.ProcessEnv = process.env,
  cwd: string = process.cwd()
): PostEditOptions {
  const projectDir = env.CLAUDE_PROJECT_DIR || cwd;
  const preferCheckScript =
    env.CC_CHECK_SCRIPT && env.CC_CHECK_SCRIPT.trim().length > 0
      ? env.CC_CHECK_SCRIPT
      : "check";
  const fallbackScript = "check:all";

  return {
    projectDir,
    preferCheckScript,
    fallbackScript,
    logFile: path.join(projectDir, ".claude", "last-checks.log"),
  };
}

export function defaultRunner(projectDir: string): CommandRunner {
  return (cmd: string) =>
    new Promise((resolve) => {
      const child = spawn(cmd, { cwd: projectDir, shell: true, env: process.env });
      child.on("close", (code) => resolve(code ?? 1));
    });
}

export function readLogTail(logFile: string, lines: number): string {
  try {
    const content = fs.readFileSync(logFile, "utf8").split(/\r?\n/);
    return content.slice(-lines).join("\n");
  } catch (error) {
    return `(failed to read ${logFile}: ${String(error)})`;
  }
}

export async function runPostEditChecks(
  options: PostEditOptions,
  runner: CommandRunner = defaultRunner(options.projectDir)
): Promise<{ exitCode: 0; output?: string }> {
  let rc = await runner(`npm run ${options.preferCheckScript}`);
  if (rc !== 0 && options.preferCheckScript !== options.fallbackScript) {
    rc = await runner(`npm run ${options.fallbackScript}`);
  }

  if (rc !== 0) {
    const tail = readLogTail(options.logFile, 120);
    const output = JSON.stringify({
      decision: "block",
      reason: "Post-edit checks failed (lint/typecheck). Fix errors before continuing.",
      additionalContext: `---- last-checks.log (tail) ----\n${tail}\n`,
    });

    return { exitCode: 0, output };
  }

  return { exitCode: 0 };
}

export async function main() {
  const options = resolvePostEditOptions();
  const result = await runPostEditChecks(options);
  if (result.output) {
    process.stdout.write(result.output);
  }
  process.exit(result.exitCode);
}

const isDirectRun = fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? "");
if (isDirectRun) {
  void main();
}
