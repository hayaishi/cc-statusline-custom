/**
 * Type definitions for formatted metrics output.
 *
 * These types represent the intermediate data structure between
 * parsed input and the final statusline string.
 */

/**
 * Source of a metric value, useful for debugging and testing.
 */
export type MetricSource = 'stdin' | 'cache' | 'fallback';

/**
 * A metric value with its source.
 * Generic type T represents the actual value type.
 */
export interface MetricValue<T> {
  readonly value: T;
  readonly source: MetricSource;
}

/**
 * Formatted metrics ready for statusline composition.
 * All fields are optional to support partial data scenarios.
 */
export interface FormattedMetrics {
  // Fast-path metrics (from stdin JSON)
  readonly model?: MetricValue<string>;
  readonly sessionCost?: MetricValue<string>;
  readonly contextUsage?: MetricValue<string>;

  // Extended metrics (from cache, when enabled)
  readonly dailyTotal?: MetricValue<string>;
  readonly blockInfo?: MetricValue<string>;
  readonly burnRate?: MetricValue<string>;
}

/**
 * Context usage threshold configuration.
 */
export interface ContextThresholds {
  readonly low: number;
  readonly medium: number;
}

/**
 * Default context thresholds per ccusage statusline guide.
 */
export const DEFAULT_CONTEXT_THRESHOLDS: ContextThresholds = {
  low: 50,
  medium: 80,
};
