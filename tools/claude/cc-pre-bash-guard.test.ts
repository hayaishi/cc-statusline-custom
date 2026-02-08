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

describe("cc-pre-bash-guard", () => {
  it("should detect git boundary commands", () => {
    expect(isGitBoundaryCommand("git commit -m test")).toBe(true);
    expect(isGitBoundaryCommand("git status")).toBe(false);
  });

  it("should parse command from payload", () => {
    const payload = JSON.stringify({ tool_input: { command: "git push" } });
    expect(parseCommandFromPayload(payload)).toBe("git push");
    expect(parseCommandFromPayload("{" )).toBe("");
  });

  it("should block when fail flag exists", async () => {
    const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "pre-bash-"));
    const options = resolvePreBashOptions({}, projectDir);
    fs.mkdirSync(path.dirname(options.failFlag), { recursive: true });
    fs.writeFileSync(options.failFlag, "", "utf8");
    fs.writeFileSync(options.logFile, "failure log", "utf8");

    const result = await runPreBashGuard(
      JSON.stringify({ tool_input: { command: "git commit -m test" } }),
      options
    );

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("previous checks failed");
  });

  it("should fall back to check:all when check fails", async () => {
    const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "pre-bash-"));
    const options = resolvePreBashOptions({}, projectDir);

    const calls: string[] = [];
    const runner: CommandRunner = async (cmd) => {
      calls.push(cmd);
      return cmd.includes("check:all") ? 0 : 1;
    };

    const result = await runPreBashGuard(
      JSON.stringify({ tool_input: { command: "git push" } }),
      options,
      runner
    );

    expect(result.exitCode).toBe(0);
    expect(calls).toEqual(["npm run check", "npm run check:all"]);
  });
});
