import { getSubscriptionCacheTtl } from '../../config/env.js';
import { registerExternalSegment } from '../../core/statusline.js';
import {
  buildSubscriptionUsageAllSegment,
  buildSubscriptionUsageSegment,
} from './segment-builders.js';
import { updateSubscriptionCache } from './update-cache.js';
import type { RenderOptions } from '../../core/formatter.js';

export function registerSubscriptionSegments(): void {
  registerExternalSegment('subscription_usage', {
    builder: (_input, cacheDir, options: RenderOptions, debug?: boolean): string => {
      return buildSubscriptionUsageSegment(cacheDir, getSubscriptionCacheTtl(), options, debug ?? false);
    },
    aliases: ['usage', 'subscription', 'sub_usage', 'sub'],
    cacheTargets: ['subscriptionUsage'],
    neverStandalone: true,
  });

  registerExternalSegment('subscription_usage_all', {
    builder: (_input, cacheDir, options: RenderOptions, debug?: boolean): string => {
      return buildSubscriptionUsageAllSegment(cacheDir, getSubscriptionCacheTtl(), options, debug ?? false);
    },
    aliases: ['sub_all', 'usage_all'],
    cacheTargets: ['subscriptionUsage'],
    neverStandalone: true,
  });
}

export { updateSubscriptionCache };
