import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { readLogTail, resolvePreEditOptions, runPreEditGuard } from "./cc-pre-edit-guard";

function createTempProjectDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function createFailFlag(projectDir: string, logContent: string): void {
  const flagPath = path.join(projectDir, ".claude", ".checks_failed");
  const logPath = path.join(projectDir, ".claude", "last-checks.log");
  fs.mkdirSync(path.dirname(flagPath), { recursive: true });
  fs.writeFileSync(flagPath, "", "utf8");
  fs.writeFileSync(logPath, logContent, "utf8");
}

describe("cc-pre-edit-guard", () => {
  it("should allow edits when no fail flag exists", () => {
    const projectDir = createTempProjectDir("pre-edit-");
    const options = resolvePreEditOptions({}, projectDir);

    const result = runPreEditGuard(options);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
  });

  it("should block edits when fail flag exists", () => {
    const projectDir = createTempProjectDir("pre-edit-");
    const options = resolvePreEditOptions({}, projectDir);
    createFailFlag(projectDir, "line1\nline2\n");

    const result = runPreEditGuard(options);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("lint/typecheck are failing");
    expect(result.stderr).toContain("line1");
  });

  it("should resolve default options from cwd", () => {
    const options = resolvePreEditOptions({}, "/my/cwd");

    expect(options.projectDir).toBe("/my/cwd");
    expect(options.failFlag).toBe("/my/cwd/.claude/.checks_failed");
    expect(options.logFile).toBe("/my/cwd/.claude/last-checks.log");
  });


  it("should return empty string when log file does not exist", () => {
    const result = readLogTail("/nonexistent/path/to/log.txt", 60);
    expect(result).toBe("");
  });
});
