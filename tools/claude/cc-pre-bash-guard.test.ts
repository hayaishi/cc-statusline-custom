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

  it("should detect git boundary commands with global options", () => {
    // -C option
    expect(isGitBoundaryCommand("git -C repo push")).toBe(true);
    expect(isGitBoundaryCommand("git -C /path/to/repo commit -m test")).toBe(true);

    // -c option
    expect(isGitBoundaryCommand("git -c core.editor=true rebase main")).toBe(true);
    expect(isGitBoundaryCommand("git -c user.name=test commit -m test")).toBe(true);

    // --git-dir option
    expect(isGitBoundaryCommand("git --git-dir=.git push")).toBe(true);
    expect(isGitBoundaryCommand("git --git-dir=/path/.git commit -m test")).toBe(true);

    // --work-tree option
    expect(isGitBoundaryCommand("git --work-tree=/path push")).toBe(true);

    // Multiple global options
    expect(isGitBoundaryCommand("git -C repo -c core.editor=vi push origin main")).toBe(true);
    expect(isGitBoundaryCommand("git --git-dir=.git --work-tree=. commit -m test")).toBe(true);

    // Flags without arguments
    expect(isGitBoundaryCommand("git --no-pager push")).toBe(true);
    expect(isGitBoundaryCommand("git --bare push")).toBe(true);

    // Non-boundary commands with options
    expect(isGitBoundaryCommand("git -C repo status")).toBe(false);
    expect(isGitBoundaryCommand("git --git-dir=.git log")).toBe(false);
  });

  it("should detect git boundary commands with common prefixes", () => {
    // sudo prefix
    expect(isGitBoundaryCommand("sudo git push")).toBe(true);
    expect(isGitBoundaryCommand("sudo git commit -m test")).toBe(true);

    // Path prefix
    expect(isGitBoundaryCommand("/usr/bin/git push")).toBe(true);
    expect(isGitBoundaryCommand("/usr/local/bin/git commit -m test")).toBe(true);

    // env prefix with variables
    expect(isGitBoundaryCommand("env GIT_DIR=.git git push")).toBe(true);

    // Combined with git options
    expect(isGitBoundaryCommand("sudo git -C repo push")).toBe(true);

    // Non-boundary with prefixes
    expect(isGitBoundaryCommand("sudo git status")).toBe(false);
    expect(isGitBoundaryCommand("/usr/bin/git log")).toBe(false);
  });

  it("should not detect git boundary commands in plain text arguments", () => {
    // echo/printf with git command as text
    expect(isGitBoundaryCommand("echo git push")).toBe(false);
    expect(isGitBoundaryCommand("printf git push")).toBe(false);
    expect(isGitBoundaryCommand("echo git commit -m test")).toBe(false);

    // Other commands with git in arguments
    expect(isGitBoundaryCommand("grep git push file.txt")).toBe(false);
    expect(isGitBoundaryCommand("echo 'git push'")).toBe(false);

    // But should still detect real git commands after these
    expect(isGitBoundaryCommand("echo done && git push")).toBe(true);
    expect(isGitBoundaryCommand("printf test; git commit -m test")).toBe(true);
  });

  it("should detect git boundary commands in common command chains", () => {
    // Common command chains with && separator
    expect(isGitBoundaryCommand("npm test && git push")).toBe(true);
    expect(isGitBoundaryCommand("npm test && git commit -m test")).toBe(true);

    // Chains with ; separator
    expect(isGitBoundaryCommand("cd repo; git commit -m test")).toBe(true);
    expect(isGitBoundaryCommand("cd repo; git push origin main")).toBe(true);

    // Chains with || separator
    expect(isGitBoundaryCommand("npm test || git push")).toBe(true);

    // Chains with newline separator
    expect(isGitBoundaryCommand("npm test\ngit push")).toBe(true);
    expect(isGitBoundaryCommand("npm test\ngit commit -m test")).toBe(true);

    // Parenthesized commands
    expect(isGitBoundaryCommand("npm test && (git push)")).toBe(true);
    expect(isGitBoundaryCommand("(git push)")).toBe(true);

    // Mixed: non-boundary git command followed by boundary command
    expect(isGitBoundaryCommand("git status && git push")).toBe(true);
    expect(isGitBoundaryCommand("git log; git commit -m test")).toBe(true);

    // Non-boundary commands only
    expect(isGitBoundaryCommand("npm test && git status")).toBe(false);
    expect(isGitBoundaryCommand("git status && git log")).toBe(false);
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

  it("should block when checks fail", async () => {
    const projectDir = createTempProjectDir("pre-bash-");
    const options = resolvePreBashOptions({}, projectDir);

    fs.mkdirSync(path.dirname(options.logFile), { recursive: true });
    fs.writeFileSync(options.logFile, "check error output\n", "utf8");

    const executedCommands: string[] = [];
    const runner: CommandRunner = async (cmd) => {
      executedCommands.push(cmd);
      return 1;
    };

    const result = await runPreBashGuard(buildPayload("git push"), options, runner);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("pre-git checks failed");
    expect(executedCommands).toEqual(["npm run check"]);
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

  it("should include log tail in error message", async () => {
    const projectDir = createTempProjectDir("pre-bash-");
    const options = resolvePreBashOptions({}, projectDir);

    fs.mkdirSync(path.dirname(options.logFile), { recursive: true });
    fs.writeFileSync(options.logFile, "check error output\n", "utf8");

    const runner: CommandRunner = async () => 1;

    const result = await runPreBashGuard(buildPayload("git commit -m test"), options, runner);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("pre-git checks failed");
    expect(result.stderr).toContain("check error output");
  });


  it("should resolve default options from cwd", () => {
    const options = resolvePreBashOptions({}, "/my/cwd");

    expect(options.projectDir).toBe("/my/cwd");
    expect(options.checkScript).toBe("check");
    expect(options.failFlag).toBe("/my/cwd/.claude/.checks_failed");
    expect(options.logFile).toBe("/my/cwd/.claude/last-checks.log");
  });

  it("should return empty string when log file does not exist", () => {
    const result = readLogTail("/nonexistent/path/to/log.txt", 80);
    expect(result).toBe("");
  });
});
