import { getSubscriptionCacheTtl } from '../../config/env.js';
import { registerExternalSegment } from '../../core/statusline.js';
import {
  buildSubscriptionUsageAllSegment,
  buildSubscriptionUsageSegment,
} from './segment-builders.js';
import { updateSubscriptionCache } from './update-cache.js';
import type { RenderOptions } from '../../core/formatter.js';

export function registerSubscriptionSegments(): void {
  const ttlSeconds = getSubscriptionCacheTtl();

  registerExternalSegment('subscription_usage', {
    builder: (_input, cacheDir, options: RenderOptions, debug = false): string =>
      buildSubscriptionUsageSegment(cacheDir, ttlSeconds, options, debug),
    aliases: ['usage', 'subscription', 'sub_usage', 'sub'],
    cacheTargets: ['subscriptionUsage'],
    cacheTtlSeconds: ttlSeconds,
    neverStandalone: true,
  });

  registerExternalSegment('subscription_usage_all', {
    builder: (_input, cacheDir, options: RenderOptions, debug = false): string =>
      buildSubscriptionUsageAllSegment(cacheDir, ttlSeconds, options, debug),
    aliases: ['sub_all', 'usage_all'],
    cacheTargets: ['subscriptionUsage'],
    cacheTtlSeconds: ttlSeconds,
    neverStandalone: true,
  });
}

export { updateSubscriptionCache };
