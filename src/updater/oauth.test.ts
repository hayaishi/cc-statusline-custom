import { EventEmitter } from 'node:events';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchOAuthUsage, parseOAuthUsage } from './oauth.js';

const mockWriteDebugLog = vi.hoisted(() => vi.fn());
const mockRequest = vi.hoisted(() => vi.fn());

vi.mock('node:https', () => ({
  request: mockRequest,
}));

vi.mock('../utils/debug-log.js', () => ({
  writeDebugLog: mockWriteDebugLog,
}));

type MockResponse = EventEmitter & {
  statusCode?: number;
  setEncoding: (encoding: string) => void;
};

type MockRequest = EventEmitter & {
  end: () => void;
};

let lastResponse: MockResponse | null = null;
let lastRequest: MockRequest | null = null;

const setupRequest = (statusCode: number): void => {
  mockRequest.mockImplementation(
    (
      _url: string,
      _options: Record<string, unknown>,
      callback: (response: MockResponse) => void
    ) => {
      const response = Object.assign(new EventEmitter(), {
        statusCode,
        setEncoding: vi.fn(),
      }) as MockResponse;
      lastResponse = response;
      callback(response);

      const request = Object.assign(new EventEmitter(), { end: vi.fn() }) as MockRequest;
      lastRequest = request;
      return request;
    }
  );
};

beforeEach(() => {
  mockRequest.mockReset();
  mockWriteDebugLog.mockReset();
  lastResponse = null;
  lastRequest = null;
});

describe('parseOAuthUsage', () => {
  it('should parse legacy response when only five_hour is present', () => {
    const json = JSON.stringify({
      five_hour: {
        utilization: 0.5,
        resets_at: '2025-01-25T12:00:00Z',
      },
    });

    const result = parseOAuthUsage(json);

    expect(result.fiveHours).toEqual({
      utilization: 0.5,
      resetsAt: '2025-01-25T12:00:00Z',
    });
    expect(result.sevenDays).toBeUndefined();
  });

  it('should parse dual response when five_hour and seven_day are present', () => {
    const json = JSON.stringify({
      five_hour: {
        utilization: 0.5,
        resets_at: '2025-01-25T12:00:00Z',
      },
      seven_day: {
        utilization: 0.8,
        resets_at: '2025-02-01T12:00:00Z',
      },
    });

    const result = parseOAuthUsage(json);

    expect(result.fiveHours).toEqual({
      utilization: 0.5,
      resetsAt: '2025-01-25T12:00:00Z',
    });
    expect(result.sevenDays).toEqual({
      utilization: 0.8,
      resetsAt: '2025-02-01T12:00:00Z',
    });
  });

  it('should parse camelCase response when fiveHour is present', () => {
    const json = JSON.stringify({
      fiveHour: {
        utilization: 0.5,
        resetsAt: '2025-01-25T12:00:00Z',
      },
    });

    const result = parseOAuthUsage(json);

    expect(result.fiveHours).toEqual({
      utilization: 0.5,
      resetsAt: '2025-01-25T12:00:00Z',
    });
  });

  it('should parse nested response when usage is wrapped', () => {
    const json = JSON.stringify({
      data: {
        five_hour: {
          utilization: 0.5,
          resets_at: '2025-01-25T12:00:00Z',
        },
      },
    });

    const result = parseOAuthUsage(json);

    expect(result.fiveHours).toEqual({
      utilization: 0.5,
      resetsAt: '2025-01-25T12:00:00Z',
    });
  });

  it('should parse nested response when only seven_day is present', () => {
    const json = JSON.stringify({
      data: {
        seven_day: {
          utilization: 100.0,
          resets_at: '2026-02-01T14:00:00.287052+00:00',
        },
      },
    });

    const result = parseOAuthUsage(json);

    expect(result.fiveHours).toBeUndefined();
    expect(result.sevenDays).toEqual({
      utilization: 100.0,
      resetsAt: '2026-02-01T14:00:00.287052+00:00',
    });
  });

  it('should ignore seven_day when it is incomplete', () => {
    const json = JSON.stringify({
      five_hour: {
        utilization: 0.5,
        resets_at: '2025-01-25T12:00:00Z',
      },
      seven_day: {
        utilization: 0.8,
        // missing resets_at
      },
    });

    const result = parseOAuthUsage(json);

    expect(result.fiveHours).toBeDefined();
    expect(result.sevenDays).toBeUndefined();
  });

  it('should parse response when only seven_day is present', () => {
    const json = JSON.stringify({
      seven_day: {
        utilization: 0.8,
        resets_at: '2025-02-01T12:00:00Z',
      },
    });

    const result = parseOAuthUsage(json);
    expect(result.fiveHours).toBeUndefined();
    expect(result.sevenDays).toEqual({
      utilization: 0.8,
      resetsAt: '2025-02-01T12:00:00Z',
    });
  });

  it('should throw error when both windows are missing', () => {
    const json = JSON.stringify({
      other_window: {},
    });

    expect(() => parseOAuthUsage(json)).toThrow('oauth_response_invalid');
  });

  it('should ignore invalid five_hour when seven_day is valid', () => {
    const json = JSON.stringify({
      five_hour: {
        utilization: 0.0,
        resets_at: null,
      },
      seven_day: {
        utilization: 100.0,
        resets_at: '2026-02-01T14:00:00.287052+00:00',
      },
    });

    const result = parseOAuthUsage(json);
    expect(result.fiveHours).toBeUndefined();
    expect(result.sevenDays).toEqual({
      utilization: 100.0,
      resetsAt: '2026-02-01T14:00:00.287052+00:00',
    });
  });

  it('should throw error when five_hour has invalid types', () => {
    const json = JSON.stringify({
      five_hour: {
        utilization: '50%', // should be number
        resets_at: '2025-01-25T12:00:00Z',
      },
    });

    expect(() => parseOAuthUsage(json)).toThrow('oauth_response_invalid');
  });

  it('should throw error when JSON is invalid', () => {
    expect(() => parseOAuthUsage('invalid-json')).toThrow();
  });

  it('should ignore extra fields when present', () => {
    const json = JSON.stringify({
      five_hour: {
        utilization: 0.5,
        resets_at: '2025-01-25T12:00:00Z',
        extra: 'field',
      },
      other_window: {},
    });

    const result = parseOAuthUsage(json);
    expect(result.fiveHours).toBeDefined();
    if (result.fiveHours) {
      expect(result.fiveHours.utilization).toBe(0.5);
    }
  });

  it('should parse extra_usage when present alongside five_hour', () => {
    const json = JSON.stringify({
      five_hour: {
        utilization: 55.0,
        resets_at: '2026-02-08T15:45:00Z',
      },
      extra_usage: {
        is_enabled: true,
        monthly_limit: 5000,
        used_credits: 428.0,
        utilization: 8.56,
      },
    });

    const result = parseOAuthUsage(json);

    expect(result.fiveHours).toBeDefined();
    expect(result.extraUsage).toEqual({
      isEnabled: true,
      monthlyLimit: 5000,
      usedCredits: 428.0,
      utilization: 8.56,
    });
  });

  it('should parse extra_usage when is_enabled is false', () => {
    const json = JSON.stringify({
      five_hour: {
        utilization: 50.0,
        resets_at: '2026-02-08T15:45:00Z',
      },
      extra_usage: {
        is_enabled: false,
        monthly_limit: 5000,
        used_credits: 0.0,
        utilization: 0.0,
      },
    });

    const result = parseOAuthUsage(json);

    expect(result.extraUsage).toEqual({
      isEnabled: false,
      monthlyLimit: 5000,
      usedCredits: 0.0,
      utilization: 0.0,
    });
  });

  it('should ignore extra_usage when fields are missing', () => {
    const json = JSON.stringify({
      five_hour: {
        utilization: 50.0,
        resets_at: '2026-02-08T15:45:00Z',
      },
      extra_usage: {
        is_enabled: true,
        // missing monthly_limit, used_credits, utilization
      },
    });

    const result = parseOAuthUsage(json);

    expect(result.fiveHours).toBeDefined();
    expect(result.extraUsage).toBeUndefined();
  });

  it('should parse response with five_hour, seven_day, and extra_usage', () => {
    const json = JSON.stringify({
      five_hour: {
        utilization: 100.0,
        resets_at: '2026-02-08T15:45:00Z',
      },
      seven_day: {
        utilization: 85.0,
        resets_at: '2026-02-08T14:00:00Z',
      },
      extra_usage: {
        is_enabled: true,
        monthly_limit: 5000,
        used_credits: 428.0,
        utilization: 8.56,
      },
    });

    const result = parseOAuthUsage(json);

    expect(result.fiveHours).toBeDefined();
    expect(result.sevenDays).toBeDefined();
    expect(result.extraUsage).toEqual({
      isEnabled: true,
      monthlyLimit: 5000,
      usedCredits: 428.0,
      utilization: 8.56,
    });
  });

  it('should parse camelCase extraUsage when present', () => {
    const json = JSON.stringify({
      fiveHour: {
        utilization: 50.0,
        resetsAt: '2026-02-08T15:45:00Z',
      },
      extraUsage: {
        isEnabled: true,
        monthlyLimit: 5000,
        usedCredits: 428.0,
        utilization: 8.56,
      },
    });

    const result = parseOAuthUsage(json);

    expect(result.fiveHours).toBeDefined();
    expect(result.extraUsage).toEqual({
      isEnabled: true,
      monthlyLimit: 5000,
      usedCredits: 428.0,
      utilization: 8.56,
    });
  });
});

describe('fetchOAuthUsage', () => {
  it('should resolve usage when response is successful', async () => {
    setupRequest(200);

    const promise = fetchOAuthUsage('token-123');
    const response = lastResponse;
    expect(response).not.toBeNull();

    response?.emit('data', JSON.stringify({
      five_hour: {
        utilization: 0.42,
        resets_at: '2026-01-20T12:00:00Z',
      },
    }));
    response?.emit('end');

    await expect(promise).resolves.toEqual({
      fiveHours: {
        utilization: 0.42,
        resetsAt: '2026-01-20T12:00:00Z',
      },
    });
    expect(mockRequest).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Accept: 'application/json',
          Authorization: 'Bearer token-123',
        }),
      }),
      expect.any(Function)
    );
    expect(mockWriteDebugLog).not.toHaveBeenCalled();
  });

  it('should log response when debug log options are provided', async () => {
    setupRequest(200);

    const promise = fetchOAuthUsage('token-123', {
      debugLogOptions: {
        enabled: true,
        filePath: '/tmp/debug.log',
        maxBytes: 1024,
        maxFiles: 3,
      },
    });
    lastResponse?.emit('data', '{"five_hour":{"utilization":0.42,"resets_at":"2026-01-20T12:00:00Z"}}');
    lastResponse?.emit('end');

    await expect(promise).resolves.toEqual({
      fiveHours: {
        utilization: 0.42,
        resetsAt: '2026-01-20T12:00:00Z',
      },
    });
    expect(mockWriteDebugLog).toHaveBeenCalledTimes(1);
    expect(mockWriteDebugLog).toHaveBeenCalledWith(
      'oauth.usage.response',
      expect.objectContaining({
        statusCode: 200,
      }),
      expect.objectContaining({
        enabled: true,
        filePath: '/tmp/debug.log',
      })
    );
  });

  it('should reject when status code is not successful', async () => {
    setupRequest(401);

    const promise = fetchOAuthUsage('token-123');
    lastResponse?.emit('data', '{"error":"unauthorized"}');
    lastResponse?.emit('end');

    let error: unknown;
    try {
      await promise;
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(Error);
    const record = error as { message?: string; responseBody?: string };
    expect(record.message).toBe('oauth_status_401');
    expect(record.responseBody).toBe('{"error":"unauthorized"}');
  });

  it('should reject when response body is invalid', async () => {
    setupRequest(200);

    const promise = fetchOAuthUsage('token-123');
    lastResponse?.emit('data', '{invalid-json');
    lastResponse?.emit('end');

    let error: unknown;
    try {
      await promise;
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(Error);
    const record = error as { responseBody?: string };
    expect(record.responseBody).toBe('{invalid-json');
  });

  it('should reject when request errors', async () => {
    setupRequest(200);

    const promise = fetchOAuthUsage('token-123');
    lastRequest?.emit('error', new Error('network failure'));

    await expect(promise).rejects.toThrow('network failure');
  });
});
