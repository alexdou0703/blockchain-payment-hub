// Shared TypeScript types for the metrics dashboard

export interface GasResult {
  operation: string;
  min: number;
  avg: number;
  max: number;
  samples: number;
}

export interface MetricsData {
  payments: {
    total: number;
    byState: Record<string, number>;
    totalVolumeUsdt: string;
    avgLockToReleaseMs: number | null;
    p50LockToReleaseMs: number | null;
    p95LockToReleaseMs: number | null;
  };
  disputes: {
    total: number;
    byState: Record<string, number>;
    avgResolutionMs: number | null;
    p50ResolutionMs: number | null;
    p95ResolutionMs: number | null;
  };
  settlement: { batchCount: number };
  gasReport: {
    results: GasResult[];
  } | null;
  generatedAt: string;
}
