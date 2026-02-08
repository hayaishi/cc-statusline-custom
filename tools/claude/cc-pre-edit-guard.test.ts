import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolvePreEditOptions, runPreEditGuard } from "./cc-pre-edit-guard";

describe("cc-pre-edit-guard", () => {
  it("should allow edits when no fail flag exists", () => {
    const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "pre-edit-"));
    const options = resolvePreEditOptions({}, projectDir);

    const result = runPreEditGuard(options);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
  });

  it("should block edits when fail flag exists", () => {
    const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "pre-edit-"));
    const options = resolvePreEditOptions({}, projectDir);
    fs.mkdirSync(path.dirname(options.failFlag), { recursive: true });
    fs.writeFileSync(options.failFlag, "", "utf8");
    fs.writeFileSync(options.logFile, "line1\nline2\n", "utf8");

    const result = runPreEditGuard(options);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("lint/typecheck are failing");
  });
});
