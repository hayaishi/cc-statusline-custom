import { appendFileSync, existsSync, mkdirSync, renameSync, statSync, unlinkSync } from 'node:fs';
import { dirname } from 'node:path';

export interface DebugLogOptions {
  enabled: boolean;
  filePath: string;
  maxBytes: number;
  maxFiles: number;
}

interface DebugLogRecord {
  timestamp: string;
  event: string;
  payload: unknown;
}

function getRotatedFilePath(filePath: string, index: number): string {
  return `${filePath}.${String(index)}`;
}

function getFileSize(filePath: string): number {
  try {
    return statSync(filePath).size;
  } catch {
    return 0;
  }
}

function rotateDebugLogFiles(filePath: string, maxFiles: number): void {
  if (maxFiles < 1) {
    return;
  }

  const oldestPath = getRotatedFilePath(filePath, maxFiles);
  if (existsSync(oldestPath)) {
    unlinkSync(oldestPath);
  }

  for (let index = maxFiles - 1; index >= 1; index -= 1) {
    const sourcePath = getRotatedFilePath(filePath, index);
    const targetPath = getRotatedFilePath(filePath, index + 1);

    if (existsSync(sourcePath)) {
      renameSync(sourcePath, targetPath);
    }
  }

  if (existsSync(filePath)) {
    renameSync(filePath, getRotatedFilePath(filePath, 1));
  }
}

function rotateIfNeeded(filePath: string, maxBytes: number, maxFiles: number, incomingBytes: number): void {
  const currentSize = getFileSize(filePath);
  if (currentSize + incomingBytes <= maxBytes) {
    return;
  }

  rotateDebugLogFiles(filePath, maxFiles);
}

export function writeDebugLog(event: string, payload: unknown, options: DebugLogOptions): void {
  const { enabled, filePath, maxBytes, maxFiles } = options;
  if (!enabled) {
    return;
  }

  try {
    const record: DebugLogRecord = {
      timestamp: new Date().toISOString(),
      event,
      payload,
    };
    const line = `${JSON.stringify(record)}\n`;

    mkdirSync(dirname(filePath), { recursive: true, mode: 0o700 });
    rotateIfNeeded(filePath, maxBytes, maxFiles, Buffer.byteLength(line, 'utf-8'));
    appendFileSync(filePath, line, { encoding: 'utf-8', mode: 0o600 });
  } catch {
    // Best-effort debug logging only.
  }
}
