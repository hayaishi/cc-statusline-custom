import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getOAuthToken } from './token.js';

const mockExecFileSync = vi.hoisted(() => vi.fn());
const osState = vi.hoisted(() => ({ testHome: '' }));

vi.mock('node:child_process', () => ({
  execFileSync: mockExecFileSync,
}));

vi.mock('node:os', async () => {
  const actual = await vi.importActual<typeof import('node:os')>('node:os');
  return {
    ...actual,
    homedir: (): string => osState.testHome,
  };
});

const originalPlatform = process.platform;

const setPlatform = (platform: NodeJS.Platform): void => {
  Object.defineProperty(process, 'platform', { value: platform, configurable: true });
};

const writeTokenFile = (filePath: string, contents: string): void => {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, contents);
};

const getClaudePath = (): string => join(osState.testHome, '.claude.json');
const getConfigPath = (): string =>
  join(osState.testHome, '.config', 'claude', 'credentials.json');

beforeEach(() => {
  mockExecFileSync.mockReset();
  osState.testHome = mkdtempSync(join(tmpdir(), 'cc-token-test-'));
});

afterEach(() => {
  Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
  rmSync(osState.testHome, { recursive: true, force: true });
});

describe('getOAuthToken', () => {
  it('should return keychain token on darwin when present', () => {
    setPlatform('darwin');
    mockExecFileSync.mockReturnValue(JSON.stringify({
      claudeAiOauth: { accessToken: ' keychain-token ' },
    }));

    const token = getOAuthToken();

    expect(token).toBe('keychain-token');
    expect(mockExecFileSync).toHaveBeenCalledTimes(1);
  });

  it('should fallback to file when keychain throws', () => {
    setPlatform('darwin');
    mockExecFileSync.mockImplementation(() => {
      throw new Error('missing');
    });

    writeTokenFile(getClaudePath(), '{invalid-json');
    writeTokenFile(getConfigPath(), JSON.stringify({
      claudeAiOauth: { accessToken: ' file-token ' },
    }));

    const token = getOAuthToken();

    expect(token).toBe('file-token');
  });

  it('should fallback to file when keychain is empty', () => {
    setPlatform('darwin');
    mockExecFileSync.mockReturnValue('   ');

    writeTokenFile(getClaudePath(), JSON.stringify({
      claudeAiOauth: { accessToken: ' file-token ' },
    }));

    const token = getOAuthToken();

    expect(token).toBe('file-token');
  });

  it('should skip empty file and use second credentials file', () => {
    setPlatform('linux');

    writeTokenFile(getClaudePath(), '   ');
    writeTokenFile(getConfigPath(), JSON.stringify({
      claudeAiOauth: { accessToken: ' second-token ' },
    }));

    const token = getOAuthToken();

    expect(token).toBe('second-token');
  });

  it('should return null when files contain invalid token structures', () => {
    setPlatform('linux');

    writeTokenFile(getClaudePath(), '1');
    writeTokenFile(getConfigPath(), JSON.stringify({
      claudeAiOauth: { accessToken: '   ' },
    }));

    const token = getOAuthToken();

    expect(token).toBeNull();
  });
});
