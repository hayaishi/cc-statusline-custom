import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type Mode = "all" | "lint" | "typecheck";

export interface DevCheckContext {
  projectDir: string;
  lintCmd: string;
  typeCmd: string;
  mode: Mode;
  logFile: string;
  failFlag: string;
}

export type ShellRunner = (cmd: string) => Promise<{ code: number; out: string }>;

export function resolveDevCheckContext(
  env: NodeJS.ProcessEnv = process.env,
  cwd: string = process.cwd(),
  args: string[] = process.argv
): DevCheckContext {
  const projectDir =
    env.PROJECT_DIR ||
    env.CLAUDE_PROJECT_DIR ||
    cwd;

  const lintCmd = env.LINT_CMD || env.CC_LINT_CMD || "npm run lint";
  const typeCmd = env.TYPECHECK_CMD || env.CC_TYPECHECK_CMD || "npm run typecheck";
  const mode = (args[2] ?? "all") as Mode;

  const claudeDir = path.join(projectDir, ".claude");
  const failFlag = path.join(claudeDir, ".checks_failed");
  const logFile = path.join(claudeDir, "last-checks.log");

  return {
    projectDir,
    lintCmd,
    typeCmd,
    mode,
    logFile,
    failFlag,
  };
}

export function defaultShellRunner(projectDir: string): ShellRunner {
  return (cmd: string) =>
    new Promise((resolve) => {
      const child = spawn(cmd, {
        cwd: projectDir,
        shell: true,
        stdio: ["ignore", "pipe", "pipe"],
        env: process.env,
      });

      let out = "";
      child.stdout.on("data", (d) => (out += d.toString()));
      child.stderr.on("data", (d) => (out += d.toString()));

      child.on("close", (code) => resolve({ code: code ?? 1, out }));
    });
}

export function appendLog(logFile: string, content: string) {
  fs.appendFileSync(logFile, content, { encoding: "utf8" });
}

export async function runChecks(
  context: DevCheckContext,
  runner: ShellRunner = defaultShellRunner(context.projectDir)
): Promise<{ lintRc: number; typeRc: number }> {
  const claudeDir = path.dirname(context.logFile);
  fs.mkdirSync(claudeDir, { recursive: true });

  fs.writeFileSync(
    context.logFile,
    `== dev-check (${context.mode}) ==\nPWD=${context.projectDir}\n\n`,
    "utf8"
  );

  let lintRc = 0;
  let typeRc = 0;

  if (context.mode === "all" || context.mode === "lint") {
    appendLog(context.logFile, `[lint] ${context.lintCmd}\n`);
    const r = await runner(context.lintCmd);
    appendLog(context.logFile, r.out + "\n");
    lintRc = r.code;
  }

  if (context.mode === "all" || context.mode === "typecheck") {
    appendLog(context.logFile, `[typecheck] ${context.typeCmd}\n`);
    const r = await runner(context.typeCmd);
    appendLog(context.logFile, r.out + "\n");
    typeRc = r.code;
  }

  if (lintRc !== 0 || typeRc !== 0) {
    fs.writeFileSync(context.failFlag, "", "utf8");
  } else {
    try {
      fs.unlinkSync(context.failFlag);
    } catch {
      // ignore
    }
  }

  return { lintRc, typeRc };
}

export async function main() {
  const context = resolveDevCheckContext();
  const { lintRc, typeRc } = await runChecks(context);

  if (lintRc !== 0 || typeRc !== 0) {
    process.exit(1);
  }
  process.exit(0);
}

const isDirectRun = fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? "");
if (isDirectRun) {
  void main();
}
