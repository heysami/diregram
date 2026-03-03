import { randomUUID } from 'node:crypto';
import os from 'node:os';
import {
  claimAsyncJobs,
  heartbeatAsyncJob,
  isAsyncJobCancelRequested,
  markAsyncJobCancelled,
  markAsyncJobFailed,
  markAsyncJobSucceeded,
  requeueAsyncJob,
} from '../lib/server/async-jobs/repo';
import type { AsyncJobRow } from '../lib/server/async-jobs/types';
import { runAsyncJob } from '../lib/server/async-jobs/runner';

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function envInt(name: string, fallback: number, min: number, max: number) {
  const raw = Number(process.env[name] || fallback);
  if (!Number.isFinite(raw)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(raw)));
}

const POLL_MS = envInt('ASYNC_JOB_POLL_MS', 1500, 250, 60_000);
const CONCURRENCY = envInt('ASYNC_JOB_CONCURRENCY', 2, 1, 32);
const LEASE_SECONDS = envInt('ASYNC_JOB_LEASE_SECONDS', 120, 30, 3600);
const HEARTBEAT_MS = Math.max(5_000, Math.floor((LEASE_SECONDS * 1000) / 3));
const WORKER_ID = `${os.hostname()}-${process.pid}-${randomUUID().slice(0, 8)}`;

function isCancelledError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err || '');
  return /cancel/i.test(msg);
}

async function runClaimedJob(job: AsyncJobRow): Promise<void> {
  if (job.cancel_requested) {
    await markAsyncJobCancelled(job.id);
    return;
  }

  let heartbeatTimer: NodeJS.Timeout | null = null;
  try {
    heartbeatTimer = setInterval(() => {
      void heartbeatAsyncJob(job.id, WORKER_ID, LEASE_SECONDS).catch((e) => {
        console.error(`[worker] heartbeat failed for ${job.id}:`, e instanceof Error ? e.message : String(e));
      });
    }, HEARTBEAT_MS);

    const result = await runAsyncJob(job);
    await markAsyncJobSucceeded(job.id, result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e || 'Job failed');
    if (job.cancel_requested || isCancelledError(e) || (await isAsyncJobCancelRequested(job.id).catch(() => false))) {
      await markAsyncJobCancelled(job.id);
      return;
    }
    if (Number(job.attempts || 0) < Number(job.max_attempts || 1)) {
      await requeueAsyncJob(job, msg);
      return;
    }
    await markAsyncJobFailed(job.id, msg);
  } finally {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
  }
}

async function loop() {
  console.log(`[worker] async-job-worker started id=${WORKER_ID} pollMs=${POLL_MS} concurrency=${CONCURRENCY} lease=${LEASE_SECONDS}s`);
  while (true) {
    try {
      const jobs = await claimAsyncJobs({ workerId: WORKER_ID, limit: CONCURRENCY, leaseSeconds: LEASE_SECONDS });
      if (!jobs.length) {
        await sleep(POLL_MS);
        continue;
      }
      await Promise.all(jobs.map((j) => runClaimedJob(j)));
    } catch (e) {
      console.error('[worker] loop error:', e instanceof Error ? e.message : String(e));
      await sleep(Math.max(POLL_MS, 2000));
    }
  }
}

void loop();
