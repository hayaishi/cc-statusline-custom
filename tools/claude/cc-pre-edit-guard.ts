import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface PreEditOptions {
  projectDir: string;
  failFlag: string;
  logFile: string;
}

export function resolvePreEditOptions(
  env: NodeJS.ProcessEnv = process.env,
  cwd: string = process.cwd()
): PreEditOptions {
  const projectDir = env.CLAUDE_PROJECT_DIR || cwd;
  return {
    projectDir,
    failFlag: path.join(projectDir, ".claude", ".checks_failed"),
    logFile: path.join(projectDir, ".claude", "last-checks.log"),
  };
}

export function readLogTail(logFile: string, lines: number): string {
  try {
    const content = fs.readFileSync(logFile, "utf8").split(/\r?\n/);
    return content.slice(-lines).join("\n");
  } catch {
    return "";
  }
}

export function runPreEditGuard(options: PreEditOptions): { exitCode: number; stderr: string } {
  if (fs.existsSync(options.failFlag)) {
    const tail = readLogTail(options.logFile, 60);
    return {
      exitCode: 2,
      stderr: `Blocked: lint/typecheck are failing. Fix them before editing further.\n${tail}\n`,
    };
  }

  return { exitCode: 0, stderr: "" };
}

export function main() {
  const options = resolvePreEditOptions();
  const result = runPreEditGuard(options);
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }
  process.exit(result.exitCode);
}

const isDirectRun = fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? "");
if (isDirectRun) {
  main();
}
