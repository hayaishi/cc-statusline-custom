import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  resolvePostEditOptions,
  runPostEditChecks,
  type CommandRunner,
} from "./cc-post-edit-checks";

describe("cc-post-edit-checks", () => {
  it("should return block JSON when checks fail", async () => {
    const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "post-edit-"));
    const logFile = path.join(projectDir, ".claude", "last-checks.log");
    fs.mkdirSync(path.dirname(logFile), { recursive: true });
    fs.writeFileSync(logFile, "line1\nline2\n", "utf8");

    const options = resolvePostEditOptions({ CC_CHECK_SCRIPT: "check" }, projectDir);
    const runner: CommandRunner = async () => 1;

    const result = await runPostEditChecks(options, runner);

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("Post-edit checks failed");
    expect(result.output).toContain("line1");
  });

  it("should fall back to check:all when check fails", async () => {
    const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "post-edit-"));
    const options = resolvePostEditOptions({}, projectDir);

    const calls: string[] = [];
    const runner: CommandRunner = async (cmd) => {
      calls.push(cmd);
      return cmd.includes("check:all") ? 0 : 1;
    };

    const result = await runPostEditChecks(options, runner);

    expect(result.exitCode).toBe(0);
    expect(result.output).toBeUndefined();
    expect(calls).toEqual(["npm run check", "npm run check:all"]);
  });
});
