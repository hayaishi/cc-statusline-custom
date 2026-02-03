import { request } from 'node:https';

const OAUTH_USAGE_URL = 'https://api.anthropic.com/api/oauth/usage';
const USER_AGENT = 'claude-code/2.1.5';

export interface UsageWindow {
  utilization: number;
  resetsAt: string;
}

export interface OAuthUsage {
  fiveHours?: UsageWindow;
  sevenDays?: UsageWindow;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function getNumberField(record: Record<string, unknown>, keys: readonly string[]): number | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
  }
  return undefined;
}

function getStringField(record: Record<string, unknown>, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string') {
      return value;
    }
  }
  return undefined;
}

function parseUsageWindow(data: unknown): UsageWindow | undefined {
  const record = asRecord(data);
  if (record === null) {
    return undefined;
  }

  const utilization = getNumberField(record, [
    'utilization',
    'utilization_percent',
    'utilizationPercent',
  ]);
  const resetsAt = getStringField(record, [
    'resets_at',
    'resetsAt',
    'reset_at',
    'resetAt',
  ]);

  if (utilization === undefined) {
    return undefined;
  }

  if (resetsAt === undefined) {
    return undefined;
  }

  return { utilization, resetsAt };
}

function resolveUsageContainer(root: Record<string, unknown>): Record<string, unknown> {
  const candidates = [
    root,
    asRecord(root.data),
    asRecord(root.usage),
    asRecord(root.subscription_usage),
    asRecord(root.subscriptionUsage),
  ].filter((candidate): candidate is Record<string, unknown> => candidate !== null);

  for (const candidate of candidates) {
    if (
      'five_hour' in candidate
      || 'fiveHour' in candidate
      || 'seven_day' in candidate
      || 'sevenDay' in candidate
    ) {
      return candidate;
    }
  }

  return root;
}

export function parseOAuthUsage(body: string): OAuthUsage {
  const parsed: unknown = JSON.parse(body);
  const root = asRecord(parsed);
  if (root === null) {
    throw new Error('oauth_response_invalid');
  }

  const container = resolveUsageContainer(root);
  const fiveHoursRaw = container.five_hour ?? container.fiveHour;
  const fiveHours = parseUsageWindow(fiveHoursRaw);

  const sevenDaysRaw = container.seven_day ?? container.sevenDay;
  const sevenDays = parseUsageWindow(sevenDaysRaw);

  if (!fiveHours && !sevenDays) {
    throw new Error('oauth_response_invalid');
  }

  const result: OAuthUsage = {};
  if (fiveHours) {
    result.fiveHours = fiveHours;
  }
  if (sevenDays) {
    result.sevenDays = sevenDays;
  }
  return result;
}

export function fetchOAuthUsage(token: string): Promise<OAuthUsage> {
  return new Promise((resolve, reject) => {
    const req = request(
      OAUTH_USAGE_URL,
      {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
          'anthropic-beta': 'oauth-2025-04-20',
          'User-Agent': USER_AGENT,
        },
      },
      (res) => {
        let data = '';
        res.setEncoding('utf-8');
        res.on('data', (chunk) => {
          data += String(chunk);
        });
        res.on('end', () => {
          const statusCode = res.statusCode ?? 0;
          if (statusCode < 200 || statusCode >= 300) {
            const error = new Error(`oauth_status_${String(statusCode)}`);
            (error as { responseBody?: string }).responseBody = data;
            reject(error);
            return;
          }

          try {
            resolve(parseOAuthUsage(data));
          } catch (error) {
            const normalizedError = error instanceof Error ? error : new Error(String(error));
            (normalizedError as { responseBody?: string }).responseBody = data;
            reject(normalizedError);
          }
        });
      }
    );

    req.on('error', (error) => {
      reject(error instanceof Error ? error : new Error(String(error)));
    });

    req.end();
  });
}
