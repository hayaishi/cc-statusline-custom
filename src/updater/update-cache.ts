/**
 * Cache updater entrypoint.
 *
 * Delegates subscription cache updates to the experimental module when available.
 */

/**
 * Result of a cache update operation.
 */
export interface UpdateCacheResult {
  success: boolean;
  message: string;
}

/**
 * Options for cache update operation.
 */
export interface UpdateCacheOptions {
  mode?: 'auto' | 'force';
  debug?: boolean;
  ccVersion?: string;
}

interface SubscriptionUpdateModule {
  updateSubscriptionCache: (
    cacheDir?: string,
    options?: UpdateCacheOptions
  ) => Promise<UpdateCacheResult>;
}

/**
 * Updates cache via the experimental subscription module.
 */
export async function updateCache(
  cacheDir?: string,
  options?: UpdateCacheOptions
): Promise<UpdateCacheResult> {
  try {
    const module = await import('../experimental/subscription-usage/update-cache.js') as SubscriptionUpdateModule;
    return await module.updateSubscriptionCache(cacheDir, options);
  } catch {
    return {
      success: false,
      message: 'Subscription module not loaded',
    };
  }
}
