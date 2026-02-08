import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolvePreEditOptions, runPreEditGuard } from "./cc-pre-edit-guard";

function createTempProjectDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function createFailFlag(flagPath: string, logPath: string, logContent: string): void {
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
    createFailFlag(options.failFlag, options.logFile, "line1\nline2\n");

    const result = runPreEditGuard(options);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("lint/typecheck are failing");
  });
});
