import { EventEmitter } from 'node:events';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchOAuthUsage, parseOAuthUsage } from './oauth.js';

const mockRequest = vi.hoisted(() => vi.fn());

vi.mock('node:https', () => ({
  request: mockRequest,
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

const setupRequest = (statusCode: number) => {
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

    expect(result.fiveHour).toEqual({
      utilization: 0.5,
      resetsAt: '2025-01-25T12:00:00Z',
    });
    expect(result.sevenDay).toBeUndefined();
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

    expect(result.fiveHour).toEqual({
      utilization: 0.5,
      resetsAt: '2025-01-25T12:00:00Z',
    });
    expect(result.sevenDay).toEqual({
      utilization: 0.8,
      resetsAt: '2025-02-01T12:00:00Z',
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

    expect(result.fiveHour).toBeDefined();
    expect(result.sevenDay).toBeUndefined();
  });

  it('should throw error when five_hour is missing', () => {
    const json = JSON.stringify({
      seven_day: {
        utilization: 0.8,
        resets_at: '2025-02-01T12:00:00Z',
      },
    });

    expect(() => parseOAuthUsage(json)).toThrow('oauth_response_invalid');
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
    expect(result.fiveHour.utilization).toBe(0.5);
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
      fiveHour: {
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
  });

  it('should reject when status code is not successful', async () => {
    setupRequest(401);

    const promise = fetchOAuthUsage('token-123');
    lastResponse?.emit('end');

    await expect(promise).rejects.toThrow('oauth_status_401');
  });

  it('should reject when response body is invalid', async () => {
    setupRequest(200);

    const promise = fetchOAuthUsage('token-123');
    lastResponse?.emit('data', '{invalid-json');
    lastResponse?.emit('end');

    await expect(promise).rejects.toThrow();
  });

  it('should reject when request errors', async () => {
    setupRequest(200);

    const promise = fetchOAuthUsage('token-123');
    lastRequest?.emit('error', new Error('network failure'));

    await expect(promise).rejects.toThrow('network failure');
  });
});
