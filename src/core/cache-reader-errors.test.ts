import { beforeEach, describe, expect, it, vi } from 'vitest';

import { isLockFileFresh } from './cache-reader.js';

const fsMocks = vi.hoisted(() => ({
  existsSync: vi.fn(),
  statSync: vi.fn(),
  readFileSync: vi.fn(),
}));

vi.mock('node:fs', () => fsMocks);

describe('isLockFileFresh error handling', () => {
  beforeEach(() => {
    fsMocks.existsSync.mockReset();
    fsMocks.statSync.mockReset();
  });

  it('returns false when existsSync throws', () => {
    fsMocks.existsSync.mockImplementation(() => {
      throw new Error('exists-failed');
    });

    expect(isLockFileFresh('/cache')).toBe(false);
  });

  it('returns false when statSync throws', () => {
    fsMocks.existsSync.mockReturnValue(true);
    fsMocks.statSync.mockImplementation(() => {
      throw new Error('stat-failed');
    });

    expect(isLockFileFresh('/cache')).toBe(false);
  });
});
