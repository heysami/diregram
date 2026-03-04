'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export type AsyncTrackedJobKind =
  | 'ai_file_generation'
  | 'ai_grid_rule'
  | 'ai_diagram_assist'
  | 'rag_ingest'
  | 'rag_ingest_jwt'
  | 'docling_convert';

export type AsyncTrackedJob = {
  id: string;
  kind: AsyncTrackedJobKind | string;
  title: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'cancel_requested';
  step: string;
  progressPct: number;
  cancelRequested: boolean;
  createdAt: string;
  updatedAt: string;
  finishedAt: string | null;
  error: string | null;
  result: Record<string, unknown>;
};

type JobStatusResponse = {
  ok?: boolean;
  error?: string;
  job?: {
    id?: string;
    kind?: string;
    status?: string;
    step?: string;
    progressPct?: number;
    cancelRequested?: boolean;
    error?: string | null;
    createdAt?: string;
    updatedAt?: string;
    finishedAt?: string | null;
  };
  result?: Record<string, unknown>;
};

const STORAGE_KEY = 'diregram.asyncQueue.v1';
const POLL_MS = 2000;
const TERMINAL_TTL_MS = 10 * 60 * 1000;

function nowIso() {
  return new Date().toISOString();
}

function isTerminal(status: string) {
  return status === 'succeeded' || status === 'failed' || status === 'cancelled';
}

function pruneExpiredJobs(list: AsyncTrackedJob[]): AsyncTrackedJob[] {
  const now = Date.now();
  return list.filter((j) => {
    if (!isTerminal(j.status)) return true;
    if (!j.finishedAt) return true;
    const ts = Date.parse(j.finishedAt);
    if (!Number.isFinite(ts)) return true;
    return now - ts <= TERMINAL_TTL_MS;
  });
}

function safeParseStored(input: string): AsyncTrackedJob[] {
  try {
    const parsed = JSON.parse(String(input || ''));
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((x) => (x && typeof x === 'object' ? (x as Record<string, unknown>) : null))
      .filter((x): x is Record<string, unknown> => x !== null)
      .map((x) => ({
        id: String(x.id || '').trim(),
        kind: String(x.kind || '').trim() || 'docling_convert',
        title: String(x.title || 'Job'),
        status: String(x.status || 'queued') as AsyncTrackedJob['status'],
        step: String(x.step || 'queued'),
        progressPct: Number(x.progressPct || 0),
        cancelRequested: Boolean(x.cancelRequested || String(x.status || '') === 'cancel_requested'),
        createdAt: String(x.createdAt || nowIso()),
        updatedAt: String(x.updatedAt || nowIso()),
        finishedAt: x.finishedAt ? String(x.finishedAt) : null,
        error: x.error ? String(x.error) : null,
        result: x.result && typeof x.result === 'object' ? (x.result as Record<string, unknown>) : {},
      }))
      .filter((x) => Boolean(x.id));
  } catch {
    return [];
  }
}

function loadStoredJobs(): AsyncTrackedJob[] {
  if (typeof window === 'undefined') return [];
  try {
    return safeParseStored(window.localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveStoredJobs(next: AsyncTrackedJob[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

function normalizeTitle(kind: string, title?: string) {
  if (title && title.trim()) return title.trim();
  if (kind === 'ai_file_generation') return 'AI file generation';
  if (kind === 'ai_grid_rule') return 'Grid AI rule';
  if (kind === 'ai_diagram_assist') return 'Diagram AI assist';
  if (kind === 'rag_ingest' || kind === 'rag_ingest_jwt') return 'Knowledge base build';
  if (kind === 'docling_convert') return 'Docling conversion';
  return 'Async job';
}

export function useAsyncJobQueue() {
  const [jobs, setJobs] = useState<AsyncTrackedJob[]>(() => pruneExpiredJobs(loadStoredJobs()));
  const pollingRef = useRef<number | null>(null);

  useEffect(() => {
    saveStoredJobs(pruneExpiredJobs(jobs));
  }, [jobs]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setJobs((prev) => pruneExpiredJobs(prev));
    }, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const upsertJob = useCallback((job: AsyncTrackedJob) => {
    setJobs((prev) => {
      const current = pruneExpiredJobs(prev);
      const idx = current.findIndex((x) => x.id === job.id);
      if (idx === -1) return [job, ...current];
      const next = current.slice();
      next[idx] = job;
      return pruneExpiredJobs(next);
    });
  }, []);

  const trackJob = useCallback((input: { id: string; kind: string; title?: string }) => {
    const id = String(input.id || '').trim();
    if (!id) return;
    const kind = String(input.kind || '').trim() || 'docling_convert';
    const title = normalizeTitle(kind, input.title);
    const now = nowIso();
    upsertJob({
      id,
      kind,
      title,
      status: 'queued',
      step: 'queued',
      progressPct: 0,
      cancelRequested: false,
      createdAt: now,
      updatedAt: now,
      finishedAt: null,
      error: null,
      result: {},
    });
  }, [upsertJob]);

  const removeJob = useCallback((jobId: string) => {
    const id = String(jobId || '').trim();
    if (!id) return;
    setJobs((prev) => prev.filter((j) => j.id !== id));
  }, []);

  const clearFinished = useCallback(() => {
    setJobs((prev) => prev.filter((j) => !isTerminal(j.status)));
  }, []);

  const cancelJob = useCallback(async (jobId: string): Promise<{ ok: boolean; error?: string }> => {
    const id = String(jobId || '').trim();
    if (!id) return { ok: false, error: 'Missing job id' };
    try {
      const res = await fetch(`/api/async-jobs/${encodeURIComponent(id)}/cancel`, { method: 'POST' });
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        return { ok: false, error: String(json.error || `Failed to cancel (${res.status})`) };
      }
      setJobs((prev) =>
        prev.map((j) =>
          j.id === id && (j.status === 'queued' || j.status === 'running')
            ? { ...j, status: 'cancel_requested', step: 'cancel_requested', cancelRequested: true, updatedAt: nowIso() }
            : j,
        ),
      );
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e || 'Failed to cancel') };
    }
  }, []);

  const pollOne = useCallback(async (job: AsyncTrackedJob) => {
    try {
      const res = await fetch(`/api/async-jobs/${encodeURIComponent(job.id)}`, { method: 'GET' });
      const json = (await res.json().catch(() => ({}))) as JobStatusResponse;
      if (!res.ok) {
        const err = String(json.error || `Polling failed (${res.status})`);
        upsertJob({
          ...job,
          status: 'failed',
          step: 'failed',
          error: err,
          finishedAt: nowIso(),
          updatedAt: nowIso(),
        });
        return;
      }
      const j = json.job || {};
      const statusRaw = String(j.status || job.status);
      let status = (statusRaw === 'queued' || statusRaw === 'running' || statusRaw === 'succeeded' || statusRaw === 'failed' || statusRaw === 'cancelled' || statusRaw === 'cancel_requested'
        ? statusRaw
        : job.status) as AsyncTrackedJob['status'];
      const cancelRequested = Boolean(j.cancelRequested);
      // Keep canceling sticky while backend reports the cancellation request is still active.
      if (cancelRequested && (status === 'queued' || status === 'running' || status === 'cancel_requested')) {
        status = 'cancel_requested';
      }
      // Also keep it sticky client-side once the user has requested cancel,
      // until a terminal state arrives.
      if (!cancelRequested && job.status === 'cancel_requested' && (status === 'queued' || status === 'running')) {
        status = 'cancel_requested';
      }
      const finishedAt = isTerminal(status) ? String(j.finishedAt || nowIso()) : null;
      upsertJob({
        ...job,
        kind: String(j.kind || job.kind),
        status,
        step: String(j.step || job.step || 'queued'),
        progressPct: Number(j.progressPct ?? job.progressPct ?? 0),
        cancelRequested,
        updatedAt: String(j.updatedAt || nowIso()),
        finishedAt,
        error: j.error ? String(j.error) : null,
        result: json.result && typeof json.result === 'object' ? json.result : job.result,
      });
    } catch (e) {
      upsertJob({
        ...job,
        status: 'failed',
        step: 'failed',
        cancelRequested: false,
        error: e instanceof Error ? e.message : String(e || 'Polling failed'),
        finishedAt: nowIso(),
        updatedAt: nowIso(),
      });
    }
  }, [upsertJob]);

  useEffect(() => {
    const hasActive = jobs.some((j) => j.status === 'queued' || j.status === 'running' || j.status === 'cancel_requested');
    if (!hasActive) {
      if (pollingRef.current) window.clearInterval(pollingRef.current);
      pollingRef.current = null;
      return;
    }

    const tick = () => {
      const active = jobs.filter((j) => j.status === 'queued' || j.status === 'running' || j.status === 'cancel_requested');
      if (!active.length) return;
      void Promise.all(active.map((j) => pollOne(j)));
    };

    tick();
    if (!pollingRef.current) {
      pollingRef.current = window.setInterval(tick, POLL_MS);
    }
    return () => {
      if (pollingRef.current) {
        window.clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [jobs, pollOne]);

  const sortedJobs = useMemo(() => {
    return jobs.slice().sort((a, b) => {
      const ta = Date.parse(a.updatedAt || a.createdAt || '');
      const tb = Date.parse(b.updatedAt || b.createdAt || '');
      return (Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0);
    });
  }, [jobs]);

  return {
    jobs: sortedJobs,
    hasActiveJobs: sortedJobs.some((j) => j.status === 'queued' || j.status === 'running' || j.status === 'cancel_requested'),
    trackJob,
    removeJob,
    clearFinished,
    cancelJob,
  };
}
