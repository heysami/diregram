export type AsyncJobKind = 'rag_ingest' | 'rag_ingest_jwt' | 'docling_convert';

export type AsyncJobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';

export type AsyncJobRow = {
  id: string;
  kind: AsyncJobKind;
  status: AsyncJobStatus;
  owner_id: string;
  requester_user_id: string | null;
  project_folder_id: string | null;
  input: Record<string, unknown>;
  state: Record<string, unknown>;
  result: Record<string, unknown>;
  progress_pct: number;
  step: string;
  attempts: number;
  max_attempts: number;
  run_after: string;
  lease_until: string | null;
  worker_id: string | null;
  dedupe_key: string | null;
  error: string | null;
  secret_payload: string | null;
  cancel_requested: boolean;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  finished_at: string | null;
  heartbeat_at: string | null;
};

export type CreateAsyncJobInput = {
  kind: AsyncJobKind;
  ownerId: string;
  requesterUserId?: string | null;
  projectFolderId?: string | null;
  input: Record<string, unknown>;
  state?: Record<string, unknown>;
  result?: Record<string, unknown>;
  dedupeKey?: string | null;
  maxAttempts?: number;
  secretPayload?: string | null;
};

export type AsyncJobSummary = {
  id: string;
  kind: AsyncJobKind;
  status: AsyncJobStatus;
  step: string;
  progressPct: number;
  attempts: number;
  maxAttempts: number;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  finishedAt: string | null;
};

export function toAsyncJobSummary(row: AsyncJobRow): AsyncJobSummary {
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    step: row.step,
    progressPct: Number(row.progress_pct || 0),
    attempts: Number(row.attempts || 0),
    maxAttempts: Number(row.max_attempts || 0),
    error: row.error ? String(row.error) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    finishedAt: row.finished_at || null,
  };
}
