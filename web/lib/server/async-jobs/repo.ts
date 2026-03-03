import type { SupabaseClient } from '@supabase/supabase-js';
import { getAdminSupabaseClient } from '@/lib/server/supabase-admin';
import type { AsyncJobRow, CreateAsyncJobInput } from './types';

function nowIso(d = new Date()) {
  return d.toISOString();
}

function envInt(name: string, fallback: number, min: number, max: number): number {
  const raw = Number(process.env[name] || fallback);
  if (!Number.isFinite(raw)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(raw)));
}

export function getDefaultMaxAttempts() {
  return envInt('ASYNC_JOB_MAX_ATTEMPTS', 3, 1, 20);
}

export async function findActiveJobByDedupeKey(dedupeKey: string, admin?: SupabaseClient): Promise<AsyncJobRow | null> {
  const db = admin || getAdminSupabaseClient();
  const { data, error } = await db
    .from('async_jobs')
    .select('*')
    .eq('dedupe_key', dedupeKey)
    .in('status', ['queued', 'running'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data || null) as AsyncJobRow | null;
}

export async function createAsyncJob(input: CreateAsyncJobInput, admin?: SupabaseClient): Promise<{ job: AsyncJobRow; deduped: boolean }> {
  const db = admin || getAdminSupabaseClient();
  const dedupeKey = input.dedupeKey ? String(input.dedupeKey) : '';

  if (dedupeKey) {
    const existing = await findActiveJobByDedupeKey(dedupeKey, db);
    if (existing) return { job: existing, deduped: true };
  }

  const row = {
    kind: input.kind,
    status: 'queued',
    owner_id: input.ownerId,
    requester_user_id: input.requesterUserId || null,
    project_folder_id: input.projectFolderId || null,
    input: input.input || {},
    state: input.state || {},
    result: input.result || {},
    progress_pct: 0,
    step: 'queued',
    attempts: 0,
    max_attempts: Number.isFinite(Number(input.maxAttempts)) ? Number(input.maxAttempts) : getDefaultMaxAttempts(),
    run_after: nowIso(),
    lease_until: null,
    worker_id: null,
    dedupe_key: dedupeKey || null,
    error: null,
    secret_payload: input.secretPayload || null,
    cancel_requested: false,
    started_at: null,
    finished_at: null,
    heartbeat_at: null,
  };

  const { data, error } = await db.from('async_jobs').insert(row as never).select('*').single();
  if (error) {
    if (dedupeKey && /duplicate key|unique/i.test(String(error.message || ''))) {
      const existing = await findActiveJobByDedupeKey(dedupeKey, db);
      if (existing) return { job: existing, deduped: true };
    }
    throw new Error(error.message);
  }
  return { job: data as AsyncJobRow, deduped: false };
}

export async function claimAsyncJobs(opts: { workerId: string; limit: number; leaseSeconds: number }, admin?: SupabaseClient): Promise<AsyncJobRow[]> {
  const db = admin || getAdminSupabaseClient();
  const { data, error } = await db.rpc('claim_async_jobs', {
    p_worker_id: opts.workerId,
    p_limit: opts.limit,
    p_lease_seconds: opts.leaseSeconds,
  });
  if (error) throw new Error(error.message);
  return (data || []) as AsyncJobRow[];
}

export async function getAsyncJobById(jobId: string, admin?: SupabaseClient): Promise<AsyncJobRow | null> {
  const db = admin || getAdminSupabaseClient();
  const { data, error } = await db.from('async_jobs').select('*').eq('id', jobId).maybeSingle();
  if (error) throw new Error(error.message);
  return (data || null) as AsyncJobRow | null;
}

export async function updateAsyncJob(jobId: string, patch: Record<string, unknown>, admin?: SupabaseClient): Promise<AsyncJobRow> {
  const db = admin || getAdminSupabaseClient();
  const { data, error } = await db
    .from('async_jobs')
    .update({ ...patch, updated_at: nowIso() } as never)
    .eq('id', jobId)
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return data as AsyncJobRow;
}

export async function heartbeatAsyncJob(jobId: string, workerId: string, leaseSeconds: number, admin?: SupabaseClient): Promise<void> {
  const db = admin || getAdminSupabaseClient();
  const leaseUntil = new Date(Date.now() + Math.max(30, leaseSeconds) * 1000).toISOString();
  const { error } = await db
    .from('async_jobs')
    .update({ lease_until: leaseUntil, heartbeat_at: nowIso(), updated_at: nowIso() } as never)
    .eq('id', jobId)
    .eq('worker_id', workerId)
    .eq('status', 'running');
  if (error) throw new Error(error.message);
}

export async function markAsyncJobSucceeded(jobId: string, result: Record<string, unknown>, admin?: SupabaseClient): Promise<void> {
  const db = admin || getAdminSupabaseClient();
  const { error } = await db
    .from('async_jobs')
    .update({
      status: 'succeeded',
      step: 'done',
      progress_pct: 100,
      result,
      error: null,
      secret_payload: null,
      finished_at: nowIso(),
      lease_until: null,
      worker_id: null,
      updated_at: nowIso(),
    } as never)
    .eq('id', jobId);
  if (error) throw new Error(error.message);
}

export async function requeueAsyncJob(job: AsyncJobRow, errorMessage: string, admin?: SupabaseClient): Promise<void> {
  const db = admin || getAdminSupabaseClient();
  const nextDelaySec = Math.min(90, Math.max(2, 2 ** Math.max(0, Number(job.attempts || 1) - 1) * 3));
  const nextRun = new Date(Date.now() + nextDelaySec * 1000).toISOString();
  const { error } = await db
    .from('async_jobs')
    .update({
      status: 'queued',
      step: 'retrying',
      run_after: nextRun,
      lease_until: null,
      worker_id: null,
      error: String(errorMessage || 'Job failed'),
      updated_at: nowIso(),
    } as never)
    .eq('id', job.id);
  if (error) throw new Error(error.message);
}

export async function markAsyncJobFailed(jobId: string, errorMessage: string, admin?: SupabaseClient): Promise<void> {
  const db = admin || getAdminSupabaseClient();
  const { error } = await db
    .from('async_jobs')
    .update({
      status: 'failed',
      step: 'failed',
      error: String(errorMessage || 'Job failed'),
      lease_until: null,
      worker_id: null,
      secret_payload: null,
      finished_at: nowIso(),
      updated_at: nowIso(),
    } as never)
    .eq('id', jobId);
  if (error) throw new Error(error.message);
}

export async function markAsyncJobCancelled(jobId: string, admin?: SupabaseClient): Promise<void> {
  const db = admin || getAdminSupabaseClient();
  const { error } = await db
    .from('async_jobs')
    .update({
      status: 'cancelled',
      step: 'cancelled',
      error: null,
      lease_until: null,
      worker_id: null,
      secret_payload: null,
      finished_at: nowIso(),
      updated_at: nowIso(),
    } as never)
    .eq('id', jobId);
  if (error) throw new Error(error.message);
}

export async function requestAsyncJobCancel(jobId: string, admin?: SupabaseClient): Promise<void> {
  const db = admin || getAdminSupabaseClient();
  const { error } = await db.from('async_jobs').update({ cancel_requested: true, updated_at: nowIso() } as never).eq('id', jobId);
  if (error) throw new Error(error.message);
}

export async function isAsyncJobCancelRequested(jobId: string, admin?: SupabaseClient): Promise<boolean> {
  const db = admin || getAdminSupabaseClient();
  const { data, error } = await db.from('async_jobs').select('cancel_requested').eq('id', jobId).maybeSingle();
  if (error) throw new Error(error.message);
  const row = data && typeof data === 'object' ? (data as { cancel_requested?: unknown }) : {};
  return Boolean(row.cancel_requested);
}
