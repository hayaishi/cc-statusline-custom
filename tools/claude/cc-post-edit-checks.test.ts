import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  readLogTail,
  resolvePostEditOptions,
  runPostEditChecks,
  type CommandRunner,
} from "./cc-post-edit-checks";

function createTempProjectDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function createLogFile(projectDir: string, content: string): string {
  const logFile = path.join(projectDir, ".claude", "last-checks.log");
  fs.mkdirSync(path.dirname(logFile), { recursive: true });
  fs.writeFileSync(logFile, content, "utf8");
  return logFile;
}

describe("cc-post-edit-checks", () => {
  it("should return block JSON with log tail when checks fail", async () => {
    const projectDir = createTempProjectDir("post-edit-");
    createLogFile(projectDir, "line1\nline2\n");

    const options = resolvePostEditOptions({ CC_CHECK_SCRIPT: "check" }, projectDir);
    const runner: CommandRunner = async () => 1;

    const result = await runPostEditChecks(options, runner);

    expect(result.exitCode).toBe(0);
    expect(result.output).toBeDefined();
    expect(result.output).toContain("Post-edit checks failed");
    expect(result.output).toContain("line1");
  });

  it("should try fallback script when primary check fails", async () => {
    const projectDir = createTempProjectDir("post-edit-");
    const options = resolvePostEditOptions({}, projectDir);

    const executedCommands: string[] = [];
    const runner: CommandRunner = async (cmd) => {
      executedCommands.push(cmd);
      // Primary check fails, fallback succeeds
      return cmd.includes("check:all") ? 0 : 1;
    };

    const result = await runPostEditChecks(options, runner);

    expect(result.exitCode).toBe(0);
    expect(result.output).toBeUndefined();
    expect(executedCommands).toEqual(["npm run check", "npm run check:all"]);
  });

  it("should return no output when primary check succeeds", async () => {
    const projectDir = createTempProjectDir("post-edit-");
    const options = resolvePostEditOptions({}, projectDir);

    const runner: CommandRunner = async () => 0;

    const result = await runPostEditChecks(options, runner);

    expect(result.exitCode).toBe(0);
    expect(result.output).toBeUndefined();
  });

  it("should skip fallback when preferCheckScript equals fallbackScript", async () => {
    const projectDir = createTempProjectDir("post-edit-");
    const options = resolvePostEditOptions({ CC_CHECK_SCRIPT: "check:all" }, projectDir);
    createLogFile(projectDir, "check failed\n");

    const executedCommands: string[] = [];
    const runner: CommandRunner = async (cmd) => {
      executedCommands.push(cmd);
      return 1;
    };

    const result = await runPostEditChecks(options, runner);

    expect(result.exitCode).toBe(0);
    expect(result.output).toBeDefined();
    expect(result.output).toContain("block");
    expect(executedCommands).toHaveLength(1);
    expect(executedCommands[0]).toBe("npm run check:all");
  });

  it("should resolve default options from cwd", () => {
    const options = resolvePostEditOptions({}, "/my/cwd");

    expect(options.projectDir).toBe("/my/cwd");
    expect(options.preferCheckScript).toBe("check");
    expect(options.fallbackScript).toBe("check:all");
    expect(options.logFile).toBe("/my/cwd/.claude/last-checks.log");
  });

  it("should return error message when log file does not exist", () => {
    const result = readLogTail("/nonexistent/path/to/log.txt", 120);
    expect(result).toContain("failed to read");
  });
});
