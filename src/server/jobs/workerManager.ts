/**
 * Reployty Background Worker & Scheduled Tasks Subsystem
 * 
 * Manages periodic asynchronous housekeeping jobs:
 * 1. Subscription grace-period evaluation and auto-downgrades.
 * 2. Expired OTP challenges cleanup.
 * 3. Expired sessions cleanup.
 * 4. Expired unclaimed reward vouchers status update.
 * 
 * Features:
 * - Overlap protection (prevents concurrent execution of the same worker).
 * - Idempotent, transaction-safe operations.
 * - Structured logging with execution duration and metrics.
 * - Graceful shutdown capability.
 */

import { prisma } from '../db/client';
import { evaluateGraceAndDowngrades } from '../services/billingService';
import { processDueScheduledCampaigns } from '../services/campaignSchedulerService';
import { recoverStaleDeliveries } from '../services/campaignQueueService';
import { processTimeBasedRetention } from '../services/retentionWorkflowService';
import { logger } from '../utils/logger';

export interface WorkerJobResult {
  jobName: string;
  success: boolean;
  durationMs: number;
  details?: Record<string, any>;
  error?: string;
}

class WorkerManager {
  private intervals: NodeJS.Timeout[] = [];
  private activeLocks = new Set<string>();

  /**
   * Executes a job with overlap protection and structured logging.
   */
  async runJob(name: string, jobFn: () => Promise<Record<string, any>>): Promise<WorkerJobResult> {
    if (this.activeLocks.has(name)) {
      logger.warn(`Worker [${name}] skipped: previous run still in progress`, { jobName: name });
      return {
        jobName: name,
        success: false,
        durationMs: 0,
        error: 'OVERLAPPING_EXECUTION_PREVENTED',
      };
    }

    this.activeLocks.add(name);
    const start = Date.now();

    try {
      const details = await jobFn();
      const durationMs = Date.now() - start;

      logger.info(`Worker [${name}] completed successfully in ${durationMs}ms`, {
        jobName: name,
        durationMs,
        ...details,
      });

      return {
        jobName: name,
        success: true,
        durationMs,
        details,
      };
    } catch (err: any) {
      const durationMs = Date.now() - start;
      logger.error(`Worker [${name}] failed after ${durationMs}ms: ${err.message}`, {
        jobName: name,
        durationMs,
        errorCode: err.code || 'WORKER_ERROR',
      });

      return {
        jobName: name,
        success: false,
        durationMs,
        error: err.message,
      };
    } finally {
      this.activeLocks.delete(name);
    }
  }

  /**
   * Job 1: Subscription Grace Period & Auto-Downgrade Worker
   */
  async runSubscriptionDowngrades(): Promise<WorkerJobResult> {
    return this.runJob('subscription_downgrades', async () => {
      const result = await evaluateGraceAndDowngrades();
      return { evaluatedCount: result.evaluated, downgradedCount: result.downgraded };
    });
  }

  /**
   * Job 2: Clean up expired OTP verification challenges older than 1 hour
   */
  async runOtpCleanup(): Promise<WorkerJobResult> {
    return this.runJob('otp_cleanup', async () => {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const res = await prisma.customerOtpChallenge.deleteMany({
        where: {
          expiresAt: { lt: oneHourAgo },
        },
      });
      return { deletedChallenges: res.count };
    });
  }

  /**
   * Job 3: Clean up expired sessions (older than 7 days past expiry)
   */
  async runSessionCleanup(): Promise<WorkerJobResult> {
    return this.runJob('session_cleanup', async () => {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const staffRes = await prisma.session.deleteMany({
        where: {
          expiresAt: { lt: sevenDaysAgo },
        },
      });
      const custRes = await prisma.customerSession.deleteMany({
        where: {
          expiresAt: { lt: sevenDaysAgo },
        },
      });
      return { deletedStaffSessions: staffRes.count, deletedCustomerSessions: custRes.count };
    });
  }

  /**
   * Job 4: Mark expired unclaimed reward vouchers
   */
  async runExpiredVouchersUpdate(): Promise<WorkerJobResult> {
    return this.runJob('expired_vouchers', async () => {
      const now = new Date();
      const res = await prisma.rewardRedemption.updateMany({
        where: {
          status: 'CLAIMED',
          expiresAt: { lt: now },
        },
        data: {
          status: 'EXPIRED',
        },
      });
      return { expiredVouchersUpdated: res.count };
    });
  }

  /**
   * Job 5: Campaign Scheduled Dispatch Worker
   * Polls for SCHEDULED campaigns whose scheduledAt has arrived and dispatches them.
   */
  async runDueScheduledCampaigns(): Promise<WorkerJobResult> {
    return this.runJob('campaign_scheduler', async () => {
      const result = await processDueScheduledCampaigns({ limit: 25 });
      return { claimedCount: result.claimedCount, executedCount: result.executedCount };
    });
  }

  /**
   * Job 6: Abandoned / Stale Delivery Recovery Worker
   * Resets abandoned PROCESSING queue items whose worker crashed or timed out.
   */
  async runStaleDeliveryRecovery(): Promise<WorkerJobResult> {
    return this.runJob('stale_delivery_recovery', async () => {
      const recoveredCount = await recoverStaleDeliveries(5);
      return { recoveredCount };
    });
  }

  /**
   * Job 7: Time-Based Retention Engine
   * Evaluates inactivity, win-back, and birthday triggers across active businesses.
   */
  async runTimeBasedRetention(): Promise<WorkerJobResult> {
    return this.runJob('retention_triggers', async () => {
      const result = await processTimeBasedRetention({ limitPerWorkflow: 50 });
      return {
        processedRulesCount: result.processedRulesCount,
        executionsCreated: result.totalExecutionsCreated,
        executionsCompleted: result.totalExecutionsCompleted,
        executionsSkipped: result.totalExecutionsSkipped,
      };
    });
  }

  /**
   * Starts periodic execution schedules for production.
   */
  startScheduledJobs(intervalMs = 5 * 60 * 1000): void {
    // Only schedule if not already running
    if (this.intervals.length > 0) return;

    logger.info('Starting background worker scheduled tasks', { intervalMs });

    // High-frequency queue & scheduler checks (every 60s or 1/5 interval)
    const queueIntervalMs = Math.max(10_000, Math.floor(intervalMs / 5));
    const campaignInterval = setInterval(() => {
      this.runDueScheduledCampaigns().catch(() => {});
      this.runStaleDeliveryRecovery().catch(() => {});
    }, queueIntervalMs);

    // Regular interval: Grace period, subscription checks & retention workflows
    const subInterval = setInterval(() => {
      this.runSubscriptionDowngrades().catch(() => {});
      this.runTimeBasedRetention().catch(() => {});
    }, intervalMs);

    // Housekeeping interval: OTP & Session cleanups & expired vouchers
    const cleanupInterval = setInterval(() => {
      this.runOtpCleanup().catch(() => {});
      this.runSessionCleanup().catch(() => {});
      this.runExpiredVouchersUpdate().catch(() => {});
    }, intervalMs * 2);

    this.intervals.push(campaignInterval, subInterval, cleanupInterval);
  }

  /**
   * Gracefully stops all active background timers.
   */
  stopScheduledJobs(): void {
    for (const interval of this.intervals) {
      clearInterval(interval);
    }
    this.intervals = [];
    logger.info('Stopped all background worker scheduled tasks');
  }

  isRunning(): boolean {
    return this.intervals.length > 0;
  }
}

export const workerManager = new WorkerManager();
