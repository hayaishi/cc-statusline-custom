import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  resolvePostEditOptions,
  runPostEditChecks,
  type CommandRunner,
} from "./cc-post-edit-checks";

function createTempProjectDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function setupLogFile(projectDir: string, content: string): string {
  const logFile = path.join(projectDir, ".claude", "last-checks.log");
  fs.mkdirSync(path.dirname(logFile), { recursive: true });
  fs.writeFileSync(logFile, content, "utf8");
  return logFile;
}

describe("cc-post-edit-checks", () => {
  it("should return block JSON with log tail when checks fail", async () => {
    const projectDir = createTempProjectDir("post-edit-");
    setupLogFile(projectDir, "line1\nline2\n");

    const options = resolvePostEditOptions({ CC_CHECK_SCRIPT: "check" }, projectDir);
    const runner: CommandRunner = async () => 1;

    const result = await runPostEditChecks(options, runner);

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("Post-edit checks failed");
    expect(result.output).toContain("line1");
  });

  it("should try fallback script when primary check fails", async () => {
    const projectDir = createTempProjectDir("post-edit-");
    const options = resolvePostEditOptions({}, projectDir);

    const executedCommands: string[] = [];
    const runner: CommandRunner = async (cmd) => {
      executedCommands.push(cmd);
      return cmd.includes("check:all") ? 0 : 1;
    };

    const result = await runPostEditChecks(options, runner);

    expect(result.exitCode).toBe(0);
    expect(result.output).toBeUndefined();
    expect(executedCommands).toEqual(["npm run check", "npm run check:all"]);
  });
});
