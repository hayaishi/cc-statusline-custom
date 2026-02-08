import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  isGitBoundaryCommand,
  parseCommandFromPayload,
  readLogTail,
  resolvePreBashOptions,
  runPreBashGuard,
  type CommandRunner,
} from "./cc-pre-bash-guard";

function createTempProjectDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function buildPayload(command: string): string {
  return JSON.stringify({ tool_input: { command } });
}

function createFailFlag(flagPath: string, logPath: string, logContent: string): void {
  fs.mkdirSync(path.dirname(flagPath), { recursive: true });
  fs.writeFileSync(flagPath, "", "utf8");
  fs.writeFileSync(logPath, logContent, "utf8");
}

describe("cc-pre-bash-guard", () => {
  it("should detect git boundary commands", () => {
    expect(isGitBoundaryCommand("git commit -m test")).toBe(true);
    expect(isGitBoundaryCommand("git merge main")).toBe(true);
    expect(isGitBoundaryCommand("git rebase main")).toBe(true);
    expect(isGitBoundaryCommand("git cherry-pick abc123")).toBe(true);
    expect(isGitBoundaryCommand("git tag v1.0")).toBe(true);
    expect(isGitBoundaryCommand("git push origin main")).toBe(true);

    expect(isGitBoundaryCommand("git status")).toBe(false);
    expect(isGitBoundaryCommand("git diff")).toBe(false);
    expect(isGitBoundaryCommand("git log")).toBe(false);
  });

  it("should parse command from JSON payload", () => {
    const payload = buildPayload("git push");
    expect(parseCommandFromPayload(payload)).toBe("git push");
    expect(parseCommandFromPayload("{")).toBe("");
  });

  it("should block git operations when fail flag exists", async () => {
    const projectDir = createTempProjectDir("pre-bash-");
    const options = resolvePreBashOptions({}, projectDir);
    createFailFlag(options.failFlag, options.logFile, "failure log");

    const result = await runPreBashGuard(buildPayload("git commit -m test"), options);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("previous checks failed");
  });

  it("should try fallback script when primary check fails", async () => {
    const projectDir = createTempProjectDir("pre-bash-");
    const options = resolvePreBashOptions({}, projectDir);

    const executedCommands: string[] = [];
    const runner: CommandRunner = async (cmd) => {
      executedCommands.push(cmd);
      // Primary check fails, fallback succeeds
      return cmd.includes("check:all") ? 0 : 1;
    };

    const result = await runPreBashGuard(buildPayload("git push"), options, runner);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(executedCommands).toEqual(["npm run check", "npm run check:all"]);
  });

  it("should allow non-git commands without running checks", async () => {
    const projectDir = createTempProjectDir("pre-bash-");
    const options = resolvePreBashOptions({}, projectDir);

    const runner: CommandRunner = async () => {
      throw new Error("Runner should not be called");
    };

    const result = await runPreBashGuard(buildPayload("ls -la"), options, runner);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
  });

  it("should block when on-the-fly checks fail", async () => {
    const projectDir = createTempProjectDir("pre-bash-");
    const options = resolvePreBashOptions({}, projectDir);

    // Create log file for error message tail
    fs.mkdirSync(path.dirname(options.logFile), { recursive: true });
    fs.writeFileSync(options.logFile, "check error output\n", "utf8");

    const runner: CommandRunner = async () => 1; // Both checks fail

    const result = await runPreBashGuard(buildPayload("git commit -m test"), options, runner);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("pre-git checks failed");
    expect(result.stderr).toContain("check error output");
  });


  it("should resolve default options from cwd", () => {
    const options = resolvePreBashOptions({}, "/my/cwd");

    expect(options.projectDir).toBe("/my/cwd");
    expect(options.preferCheckScript).toBe("check");
    expect(options.fallbackScript).toBe("check:all");
    expect(options.failFlag).toBe("/my/cwd/.claude/.checks_failed");
    expect(options.logFile).toBe("/my/cwd/.claude/last-checks.log");
  });

  it("should return empty string when log file does not exist", () => {
    const result = readLogTail("/nonexistent/path/to/log.txt", 80);
    expect(result).toBe("");
  });
});
