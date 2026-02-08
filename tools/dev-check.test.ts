import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveDevCheckContext, runChecks, type ShellRunner } from "./dev-check";

function createTempProjectDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function createSuccessRunner(): ShellRunner {
  return async () => ({ code: 0, out: "" });
}

describe("dev-check", () => {
  it("should write log and clear fail flag when all checks pass", async () => {
    const projectDir = createTempProjectDir("dev-check-");
    const context = resolveDevCheckContext(
      {
        PROJECT_DIR: projectDir,
        LINT_CMD: "lint-cmd",
        TYPECHECK_CMD: "type-cmd",
      },
      projectDir,
      ["node", "dev-check", "all"]
    );

    const result = await runChecks(context, createSuccessRunner());

    expect(result).toEqual({ lintRc: 0, typeRc: 0 });
    expect(fs.existsSync(context.failFlag)).toBe(false);

    const logContent = fs.readFileSync(context.logFile, "utf8");
    expect(logContent).toContain("== dev-check (all) ==");
    expect(logContent).toContain("[lint] lint-cmd");
    expect(logContent).toContain("[typecheck] type-cmd");
  });

  it("should create fail flag when any check fails", async () => {
    const projectDir = createTempProjectDir("dev-check-");
    const context = resolveDevCheckContext(
      {
        PROJECT_DIR: projectDir,
        LINT_CMD: "lint-cmd",
        TYPECHECK_CMD: "type-cmd",
      },
      projectDir,
      ["node", "dev-check", "all"]
    );

    const runner: ShellRunner = async (cmd) => {
      return { code: cmd === "lint-cmd" ? 1 : 0, out: `rc:${cmd}` };
    };

    const result = await runChecks(context, runner);

    expect(result).toEqual({ lintRc: 1, typeRc: 0 });
    expect(fs.existsSync(context.failFlag)).toBe(true);
  });

  it("should use cwd and default commands when env vars are absent", () => {
    const context = resolveDevCheckContext({}, "/fake/cwd", ["node", "dev-check"]);

    expect(context.projectDir).toBe("/fake/cwd");
    expect(context.lintCmd).toBe("npm run lint");
    expect(context.typeCmd).toBe("npm run typecheck");
    expect(context.mode).toBe("all");
  });

  it("should run only lint when mode is lint", async () => {
    const projectDir = createTempProjectDir("dev-check-");
    const context = resolveDevCheckContext(
      { PROJECT_DIR: projectDir },
      projectDir,
      ["node", "dev-check", "lint"]
    );

    const executedCommands: string[] = [];
    const runner: ShellRunner = async (cmd) => {
      executedCommands.push(cmd);
      return { code: 0, out: "" };
    };

    const result = await runChecks(context, runner);

    expect(result).toEqual({ lintRc: 0, typeRc: 0 });
    expect(executedCommands).toHaveLength(1);
    expect(executedCommands[0]).toContain("lint");
  });

  it("should run only typecheck when mode is typecheck", async () => {
    const projectDir = createTempProjectDir("dev-check-");
    const context = resolveDevCheckContext(
      { PROJECT_DIR: projectDir },
      projectDir,
      ["node", "dev-check", "typecheck"]
    );

    const executedCommands: string[] = [];
    const runner: ShellRunner = async (cmd) => {
      executedCommands.push(cmd);
      return { code: 0, out: "" };
    };

    const result = await runChecks(context, runner);

    expect(result).toEqual({ lintRc: 0, typeRc: 0 });
    expect(executedCommands).toHaveLength(1);
    expect(executedCommands[0]).toContain("typecheck");
  });

  it("should remove pre-existing fail flag when checks pass", async () => {
    const projectDir = createTempProjectDir("dev-check-");
    const context = resolveDevCheckContext(
      { PROJECT_DIR: projectDir },
      projectDir,
      ["node", "dev-check", "all"]
    );

    // Create fail flag before running checks
    fs.mkdirSync(path.dirname(context.failFlag), { recursive: true });
    fs.writeFileSync(context.failFlag, "", "utf8");

    const result = await runChecks(context, createSuccessRunner());

    expect(result).toEqual({ lintRc: 0, typeRc: 0 });
    expect(fs.existsSync(context.failFlag)).toBe(false);
  });
});
