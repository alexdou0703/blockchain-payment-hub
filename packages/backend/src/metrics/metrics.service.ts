import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as fs from 'fs';
import { Payment } from '../payments/entities/payment.entity';
import { Dispute } from '../disputes/entities/dispute.entity';
import { SettlementBatch } from '../settlement/entities/settlement-batch.entity';
import { DisputeState } from '@payment-hub/shared';

const GAS_REPORT_PATH = '/tmp/gas-report.json';

// ─── Interfaces ───────────────────────────────────────────────────────────────

interface PercentileMetrics {
    avg: number | null;
    p50: number | null;
    p95: number | null;
}

export interface MetricsResult {
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
    settlement: {
        batchCount: number;
    };
    gasReport: object | null;
    generatedAt: string;
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class MetricsService {
    constructor(
        @InjectRepository(Payment)
        private readonly paymentRepo: Repository<Payment>,
        @InjectRepository(Dispute)
        private readonly disputeRepo: Repository<Dispute>,
        @InjectRepository(SettlementBatch)
        private readonly settlementBatchRepo: Repository<SettlementBatch>,
    ) {}

    async getMetrics(): Promise<MetricsResult> {
        const [paymentMetrics, disputeMetrics, batchCount, gasReport] = await Promise.all([
            this.computePaymentMetrics(),
            this.computeDisputeMetrics(),
            this.countBatches(),
            this.readGasReport(),
        ]);

        return {
            payments: paymentMetrics,
            disputes: disputeMetrics,
            settlement: { batchCount },
            gasReport,
            generatedAt: new Date().toISOString(),
        };
    }

    // ── Payment metrics ───────────────────────────────────────────────────────

    private async computePaymentMetrics() {
        const payments = await this.paymentRepo.find();

        const total = payments.length;

        // Count by state
        const byState: Record<string, number> = {};
        for (const p of payments) {
            byState[p.state] = (byState[p.state] ?? 0) + 1;
        }

        // Sum of amount (stored as decimal string)
        const totalVolumeUsdt = payments
            .reduce((sum, p) => sum + parseFloat(p.amount || '0'), 0)
            .toFixed(6);

        // Lock-to-release durations (ms) — only for payments that have both timestamps
        const lockToReleaseDurations = payments
            .filter((p) => p.lockedAt != null && p.releasedAt != null)
            .map((p) => new Date(p.releasedAt).getTime() - new Date(p.lockedAt).getTime());

        const { avg: avgLockToReleaseMs, p50: p50LockToReleaseMs, p95: p95LockToReleaseMs } =
            this.computePercentiles(lockToReleaseDurations);

        return {
            total,
            byState,
            totalVolumeUsdt,
            avgLockToReleaseMs,
            p50LockToReleaseMs,
            p95LockToReleaseMs,
        };
    }

    // ── Dispute metrics ───────────────────────────────────────────────────────

    private async computeDisputeMetrics() {
        const disputes = await this.disputeRepo.find();

        const total = disputes.length;

        // Count by state
        const byState: Record<string, number> = {};
        for (const d of disputes) {
            byState[d.state] = (byState[d.state] ?? 0) + 1;
        }

        // Resolution durations: updatedAt - createdAt for RESOLVED and FINAL disputes
        const resolvedStates: string[] = [DisputeState.RESOLVED, DisputeState.FINAL];
        const resolutionDurations = disputes
            .filter((d) => resolvedStates.includes(d.state))
            .map((d) => new Date(d.updatedAt).getTime() - new Date(d.createdAt).getTime());

        const { avg: avgResolutionMs, p50: p50ResolutionMs, p95: p95ResolutionMs } =
            this.computePercentiles(resolutionDurations);

        return {
            total,
            byState,
            avgResolutionMs,
            p50ResolutionMs,
            p95ResolutionMs,
        };
    }

    // ── Settlement metrics ────────────────────────────────────────────────────

    private async countBatches(): Promise<number> {
        try {
            return await this.settlementBatchRepo.count();
        } catch {
            return 0;
        }
    }

    // ── Gas report ────────────────────────────────────────────────────────────

    private readGasReport(): object | null {
        try {
            const raw = fs.readFileSync(GAS_REPORT_PATH, 'utf8');
            return JSON.parse(raw) as object;
        } catch {
            return null;
        }
    }

    // ── Statistics helpers ────────────────────────────────────────────────────

    /**
     * Compute avg, p50, and p95 from an array of millisecond durations.
     * Returns null for all fields when the input is empty.
     */
    private computePercentiles(durations: number[]): PercentileMetrics {
        if (durations.length === 0) {
            return { avg: null, p50: null, p95: null };
        }

        const sorted = [...durations].sort((a, b) => a - b);
        const avg = Math.round(durations.reduce((s, v) => s + v, 0) / durations.length);
        const p50 = this.percentile(sorted, 50);
        const p95 = this.percentile(sorted, 95);

        return { avg, p50, p95 };
    }

    /**
     * Nearest-rank percentile from a pre-sorted array.
     */
    private percentile(sorted: number[], pct: number): number {
        const idx = Math.ceil((pct / 100) * sorted.length) - 1;
        return sorted[Math.max(0, idx)];
    }
}
