import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  isGitBoundaryCommand,
  parseCommandFromPayload,
  resolvePreBashOptions,
  runPreBashGuard,
  type CommandRunner,
} from "./cc-pre-bash-guard";

function createTempProjectDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function createFailFlag(flagPath: string, logPath: string, logContent: string): void {
  fs.mkdirSync(path.dirname(flagPath), { recursive: true });
  fs.writeFileSync(flagPath, "", "utf8");
  fs.writeFileSync(logPath, logContent, "utf8");
}

function buildPayload(command: string): string {
  return JSON.stringify({ tool_input: { command } });
}

describe("cc-pre-bash-guard", () => {
  it("should detect git boundary commands", () => {
    expect(isGitBoundaryCommand("git commit -m test")).toBe(true);
    expect(isGitBoundaryCommand("git status")).toBe(false);
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
      return cmd.includes("check:all") ? 0 : 1;
    };

    const result = await runPreBashGuard(buildPayload("git push"), options, runner);

    expect(result.exitCode).toBe(0);
    expect(executedCommands).toEqual(["npm run check", "npm run check:all"]);
  });
});
