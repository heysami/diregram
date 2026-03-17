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

function isNonRetriableMessage(msg: string): boolean {
  const clean = String(msg || '').trim();
  return clean.startsWith('NON_RETRYABLE:') || clean.startsWith('[no-retry]');
}

function stripNonRetriablePrefix(msg: string): string {
  const clean = String(msg || '').trim();
  if (clean.startsWith('NON_RETRYABLE:')) return clean.replace(/^NON_RETRYABLE:\s*/i, '').trim();
  if (clean.startsWith('[no-retry]')) return clean.replace(/^\[no-retry\]\s*/i, '').trim();
  return clean;
}

async function runClaimedJob(job: AsyncJobRow): Promise<void> {
  if (job.cancel_requested) {
    console.log(`[worker] cancel_requested before start job=${job.id} kind=${job.kind}`);
    await markAsyncJobCancelled(job.id);
    return;
  }

  let heartbeatTimer: NodeJS.Timeout | null = null;
  try {
    console.log(`[worker] start job=${job.id} kind=${job.kind} attempt=${Number(job.attempts || 0) + 1}/${job.max_attempts}`);
    heartbeatTimer = setInterval(() => {
      void heartbeatAsyncJob(job.id, WORKER_ID, LEASE_SECONDS).catch((e) => {
        console.error(`[worker] heartbeat failed for ${job.id}:`, e instanceof Error ? e.message : String(e));
      });
    }, HEARTBEAT_MS);

    const result = await runAsyncJob(job);
    console.log(`[worker] success job=${job.id} kind=${job.kind}`);
    await markAsyncJobSucceeded(job.id, result);
  } catch (e) {
    const rawMsg = e instanceof Error ? e.message : String(e || 'Job failed');
    const nonRetriable = isNonRetriableMessage(rawMsg);
    const msg = stripNonRetriablePrefix(rawMsg) || 'Job failed';
    if (job.cancel_requested || isCancelledError(e) || (await isAsyncJobCancelRequested(job.id).catch(() => false))) {
      console.warn(`[worker] cancelled job=${job.id} kind=${job.kind} msg=${msg}`);
      await markAsyncJobCancelled(job.id);
      return;
    }
    if (nonRetriable) {
      console.error(`[worker] fail job=${job.id} kind=${job.kind} no-retry msg=${msg}`);
      await markAsyncJobFailed(job.id, msg);
      return;
    }
    if (Number(job.attempts || 0) < Number(job.max_attempts || 1)) {
      console.warn(`[worker] retry job=${job.id} kind=${job.kind} msg=${msg}`);
      await requeueAsyncJob(job, msg);
      return;
    }
    console.error(`[worker] fail job=${job.id} kind=${job.kind} msg=${msg}`);
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
