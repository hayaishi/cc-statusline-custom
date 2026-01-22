import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const KEYCHAIN_SERVICE = 'Claude Code-credentials';

function parseAccessToken(raw: string): string | null {
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== 'object' || parsed === null) {
    return null;
  }

  const oauth = (parsed as { claudeAiOauth?: unknown }).claudeAiOauth;
  if (typeof oauth !== 'object' || oauth === null) {
    return null;
  }

  const token = (oauth as { accessToken?: unknown }).accessToken;
  if (typeof token !== 'string' || token.trim() === '') {
    return null;
  }

  return token.trim();
}

function readTokenFromKeychain(): string | null {
  try {
    const raw = execFileSync(
      'security',
      ['find-generic-password', '-s', KEYCHAIN_SERVICE, '-w'],
      { encoding: 'utf-8' }
    );
    const trimmed = raw.trim();
    if (trimmed === '') {
      return null;
    }
    return parseAccessToken(trimmed);
  } catch {
    return null;
  }
}

function readTokenFromFile(filePath: string): string | null {
  try {
    if (!existsSync(filePath)) {
      return null;
    }
    const raw = readFileSync(filePath, 'utf-8');
    if (raw.trim() === '') {
      return null;
    }
    return parseAccessToken(raw);
  } catch {
    return null;
  }
}

export function getOAuthToken(): string | null {
  if (process.platform === 'darwin') {
    const token = readTokenFromKeychain();
    if (token !== null) {
      return token;
    }
  }

  const home = homedir();
  const candidates = [
    join(home, '.claude.json'),
    join(home, '.config', 'claude', 'credentials.json'),
  ];

  for (const path of candidates) {
    const token = readTokenFromFile(path);
    if (token !== null) {
      return token;
    }
  }

  return null;
}
