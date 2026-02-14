export interface SubscriptionUsageEntry extends Record<string, unknown> {
  readonly utilizationPercent?: number;
  readonly resetsAt?: string;
  readonly lastError: string | null;
  readonly lastErrorDetail?: string | null;
  readonly lastAttemptAt?: string;
  readonly updatedAt?: string;
  readonly window?: 'five_hours' | 'seven_days';
  readonly fiveHours?: {
    readonly utilizationPercent: number;
    readonly resetsAt: string;
  };
  readonly sevenDays?: {
    readonly utilizationPercent: number;
    readonly resetsAt: string;
  };
  readonly extraUsage?: {
    readonly isEnabled: boolean;
    readonly usedCredits: number;
    readonly utilizationPercent: number;
  };
}
