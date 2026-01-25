import { request } from 'node:https';

const OAUTH_USAGE_URL = 'https://api.anthropic.com/api/oauth/usage';
const USER_AGENT = 'claude-code/2.1.5';

export interface UsageWindow {
  utilization: number;
  resetsAt: string;
}

export interface OAuthUsage {
  fiveHour: UsageWindow;
  sevenDay?: UsageWindow;
}

function parseUsageWindow(data: unknown): UsageWindow | undefined {
  if (typeof data !== 'object' || data === null) {
    return undefined;
  }

  const utilization = (data as { utilization?: unknown }).utilization;
  const resetsAt = (data as { resets_at?: unknown }).resets_at;

  if (typeof utilization !== 'number' || !Number.isFinite(utilization)) {
    return undefined;
  }

  if (typeof resetsAt !== 'string') {
    return undefined;
  }

  return { utilization, resetsAt };
}

export function parseOAuthUsage(body: string): OAuthUsage {
  const parsed: unknown = JSON.parse(body);
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('oauth_response_invalid');
  }

  const fiveHourRaw = (parsed as { five_hour?: unknown }).five_hour;
  const fiveHour = parseUsageWindow(fiveHourRaw);

  if (!fiveHour) {
    throw new Error('oauth_response_invalid');
  }

  const sevenDayRaw = (parsed as { seven_day?: unknown }).seven_day;
  const sevenDay = parseUsageWindow(sevenDayRaw);

  const result: OAuthUsage = { fiveHour };
  if (sevenDay) {
    result.sevenDay = sevenDay;
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
            reject(new Error(`oauth_status_${String(statusCode)}`));
            return;
          }

          try {
            resolve(parseOAuthUsage(data));
          } catch (error) {
            reject(error instanceof Error ? error : new Error(String(error)));
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
