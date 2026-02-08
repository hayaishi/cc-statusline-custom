import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveDevCheckContext, runChecks, type ShellRunner } from "./dev-check";

describe("dev-check", () => {
  it("should write log and clear fail flag when checks pass", async () => {
    const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "dev-check-"));
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
      return { code: 0, out: `ok:${cmd}` };
    };

    const result = await runChecks(context, runner);

    const logContent = fs.readFileSync(context.logFile, "utf8");
    expect(result).toEqual({ lintRc: 0, typeRc: 0 });
    expect(logContent).toContain("== dev-check (all) ==");
    expect(logContent).toContain("[lint] lint-cmd");
    expect(logContent).toContain("[typecheck] type-cmd");
    expect(fs.existsSync(context.failFlag)).toBe(false);
  });

  it("should set fail flag when a check fails", async () => {
    const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "dev-check-"));
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
});
