import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as childProcess from 'node:child_process';
import { detectClaudeCodeVersion } from './cc-version.js';

vi.mock('node:child_process');

describe('detectClaudeCodeVersion', () => {
  const mockExecSync = vi.mocked(childProcess.execSync);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should extract version from standard claude --version output', () => {
    mockExecSync.mockReturnValue('2.1.37 (Claude Code)\n');

    const result = detectClaudeCodeVersion();

    expect(result).toBe('2.1.37');
    expect(mockExecSync).toHaveBeenCalledWith('claude --version', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] });
  });

  it('should extract version when output has no trailing text', () => {
    mockExecSync.mockReturnValue('2.1.37\n');

    const result = detectClaudeCodeVersion();

    expect(result).toBe('2.1.37');
  });

  it('should extract version with major.minor only', () => {
    mockExecSync.mockReturnValue('2.1 (Claude Code)\n');

    const result = detectClaudeCodeVersion();

    expect(result).toBe('2.1');
  });

  it('should return null when version format is invalid', () => {
    mockExecSync.mockReturnValue('invalid output\n');

    const result = detectClaudeCodeVersion();

    expect(result).toBeNull();
  });

  it('should return null when command fails with error', () => {
    mockExecSync.mockImplementation(() => {
      throw new Error('Command not found');
    });

    const result = detectClaudeCodeVersion();

    expect(result).toBeNull();
  });

  it('should return null when command returns empty output', () => {
    mockExecSync.mockReturnValue('');

    const result = detectClaudeCodeVersion();

    expect(result).toBeNull();
  });

  it('should handle output with leading/trailing whitespace', () => {
    mockExecSync.mockReturnValue('  2.1.37 (Claude Code)  \n');

    const result = detectClaudeCodeVersion();

    expect(result).toBe('2.1.37');
  });

  it('should extract version with prerelease tag', () => {
    mockExecSync.mockReturnValue('2.1.37-beta.1 (Claude Code)\n');

    const result = detectClaudeCodeVersion();

    expect(result).toBe('2.1.37-beta.1');
  });

  it('should extract version with build metadata', () => {
    mockExecSync.mockReturnValue('2.1.37+build.123 (Claude Code)\n');

    const result = detectClaudeCodeVersion();

    expect(result).toBe('2.1.37+build.123');
  });
});
