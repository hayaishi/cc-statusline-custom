import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { writeDebugLog } from './debug-log.js';
import type { DebugLogOptions } from './debug-log.js';

interface DebugLogRecord {
  timestamp: string;
  event: string;
  payload: unknown;
}

function readSingleJsonLine(filePath: string): DebugLogRecord {
  const content = readFileSync(filePath, 'utf-8').trim();
  return JSON.parse(content) as DebugLogRecord;
}

function createDebugLogOptions(filePath: string, overrides?: Partial<DebugLogOptions>): DebugLogOptions {
  return {
    enabled: true,
    filePath,
    maxBytes: 1024 * 1024,
    maxFiles: 5,
    ...overrides,
  };
}

describe('debug-log', () => {
  let testDir: string;
  let logPath: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'cc-statusline-debug-log-'));
    logPath = join(testDir, 'debug', 'statusline-debug.log');
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('appends log entries', () => {
    writeDebugLog('statusline.stdin', { raw: '{"model":{}}' }, createDebugLogOptions(logPath));

    writeDebugLog('oauth.response', { statusCode: 200, body: '{"ok":true}' }, createDebugLogOptions(logPath));

    const lines = readFileSync(logPath, 'utf-8').trim().split('\n');
    expect(lines).toHaveLength(2);

    const first = JSON.parse(lines[0] ?? '{}') as DebugLogRecord;
    const second = JSON.parse(lines[1] ?? '{}') as DebugLogRecord;

    expect(first.event).toBe('statusline.stdin');
    expect(second.event).toBe('oauth.response');
  });

  it('does not write when disabled', () => {
    writeDebugLog('statusline.stdin', { raw: '{}' }, createDebugLogOptions(logPath, { enabled: false }));

    expect(existsSync(logPath)).toBe(false);
  });

  it('rotates files when max size is exceeded', () => {
    const options = createDebugLogOptions(logPath, {
      maxBytes: 120,
      maxFiles: 2,
    });

    writeDebugLog('event-1', { body: 'x'.repeat(40) }, options);
    writeDebugLog('event-2', { body: 'x'.repeat(40) }, options);
    writeDebugLog('event-3', { body: 'x'.repeat(40) }, options);

    expect(existsSync(logPath)).toBe(true);
    expect(existsSync(`${logPath}.1`)).toBe(true);
    expect(existsSync(`${logPath}.2`)).toBe(true);

    expect(readSingleJsonLine(logPath).event).toBe('event-3');
    expect(readSingleJsonLine(`${logPath}.1`).event).toBe('event-2');
    expect(readSingleJsonLine(`${logPath}.2`).event).toBe('event-1');
  });

  it('drops older rotated logs beyond maxFiles', () => {
    const options = createDebugLogOptions(logPath, {
      maxBytes: 120,
      maxFiles: 1,
    });

    writeDebugLog('event-1', { body: 'x'.repeat(40) }, options);
    writeDebugLog('event-2', { body: 'x'.repeat(40) }, options);
    writeDebugLog('event-3', { body: 'x'.repeat(40) }, options);

    expect(existsSync(logPath)).toBe(true);
    expect(existsSync(`${logPath}.1`)).toBe(true);
    expect(existsSync(`${logPath}.2`)).toBe(false);

    expect(readSingleJsonLine(logPath).event).toBe('event-3');
    expect(readSingleJsonLine(`${logPath}.1`).event).toBe('event-2');
  });
});
