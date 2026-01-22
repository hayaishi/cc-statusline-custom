import { request } from 'node:https';

const OAUTH_USAGE_URL = 'https://api.anthropic.com/api/oauth/usage';
const USER_AGENT = 'claude-code/2.1.5';

export interface OAuthUsage {
  utilization: number;
  resetsAt: string;
}

function parseOAuthUsage(body: string): OAuthUsage {
  const parsed: unknown = JSON.parse(body);
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('oauth_response_invalid');
  }

  const fiveHour = (parsed as { five_hour?: unknown }).five_hour;
  if (typeof fiveHour !== 'object' || fiveHour === null) {
    throw new Error('oauth_response_invalid');
  }

  const utilization = (fiveHour as { utilization?: unknown }).utilization;
  const resetsAt = (fiveHour as { resets_at?: unknown }).resets_at;

  if (typeof utilization !== 'number' || !Number.isFinite(utilization)) {
    throw new Error('oauth_response_invalid');
  }

  if (typeof resetsAt !== 'string') {
    throw new Error('oauth_response_invalid');
  }

  return { utilization, resetsAt };
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
          data += chunk;
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
            reject(error);
          }
        });
      }
    );

    req.on('error', (error) => {
      reject(error);
    });

    req.end();
  });
}
