import { getAdminSupabaseClient } from '@/lib/server/supabase-admin';

type JsonRecord = Record<string, unknown>;
const DOCLING_JOB_STATUS_BUCKET = String(process.env.DOCLING_JOB_STATUS_BUCKET || 'docling-files').trim() || 'docling-files';
const DOCLING_JOB_STATUS_PREFIX = '_internal/docling-jobs';

export type DoclingConvertPayload = {
  userId: string;
  bucketId: string;
  objectPath: string;
  originalFilename: string;
  jobId: string;
  outputFormat: 'markdown' | 'json';
  includeImages?: boolean;
};

export type DoclingConvertResult = {
  ok?: boolean;
  userId: string;
  bucketId: string;
  inputObjectPath: string;
  outputObjectPath: string;
  outputFormat: 'markdown' | 'json';
  imageManifestObjectPath?: string | null;
  imageAssetCount?: number;
};

type DoclingConvertOptions = {
  baseUrl: string;
  payload: DoclingConvertPayload;
  timeoutMs: number;
  enqueueAttempts?: number;
  pollIntervalMs?: number;
};

function cleanBaseUrl(url: string) {
  return String(url || '').replace(/\/+$/, '');
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

function normalizeText(input: unknown): string {
  return String(input || '').trim();
}

function clipText(input: unknown, maxChars: number): string {
  const text = normalizeText(input);
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars);
}

function parseJsonObject(text: string): JsonRecord | null {
  const raw = String(text || '').trim();
  if (!raw) return null;
  const cleaned = raw.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  try {
    const parsed = JSON.parse(cleaned);
    return parsed && typeof parsed === 'object' ? (parsed as JsonRecord) : null;
  } catch {
    // pass
  }
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1));
    return parsed && typeof parsed === 'object' ? (parsed as JsonRecord) : null;
  } catch {
    return null;
  }
}

function summarizeDoclingErrorBody(status: number, rawBody: string, json: JsonRecord): string {
  const detail = normalizeText(json.detail || json.error || json.message);
  if (detail) return clipText(detail, 600);

  const raw = String(rawBody || '');
  const looksLikeHtml = /<!doctype html/i.test(raw) || /<html[\s>]/i.test(raw);
  const requestId = normalizeText(raw.match(/Request ID:\s*([A-Za-z0-9-]+)/i)?.[1] || '');

  if (looksLikeHtml) {
    const title = normalizeText(raw.match(/<title>\s*([^<]+)\s*<\/title>/i)?.[1] || '');
    const heading = normalizeText(raw.match(/<h1[^>]*>\s*([^<]+)\s*<\/h1>/i)?.[1] || '');
    const isRenderPage = /powered by render|render(?:’|')?s documentation|render\.com/i.test(raw);
    const label = heading || title || `HTTP ${status}`;
    if (isRenderPage && status === 502) {
      return requestId
        ? `Docling upstream returned Render 502 Bad Gateway (Request ID: ${requestId})`
        : 'Docling upstream returned Render 502 Bad Gateway';
    }
    return requestId ? `Docling upstream returned ${label} (Request ID: ${requestId})` : `Docling upstream returned ${label}`;
  }

  const normalized = normalizeText(raw);
  return normalized ? clipText(normalized, 600) : `Docling failed (${status})`;
}

function isTransientStatus(status: number) {
  return [429, 502, 503, 504].includes(status);
}

function isTransientMessage(message: string) {
  const normalized = normalizeText(message).toLowerCase();
  if (!normalized) return false;
  return (
    normalized.includes('fetch failed') ||
    normalized.includes('timed out') ||
    normalized.includes('econnreset') ||
    normalized.includes('socket hang up') ||
    normalized.includes('bad gateway') ||
    normalized.includes('service unavailable') ||
    normalized.includes('gateway timeout')
  );
}

function jobStatusObjectPath(jobId: string) {
  const safeJobId = normalizeText(jobId).replace(/[^A-Za-z0-9_.-]+/g, '_') || 'job';
  return `${DOCLING_JOB_STATUS_PREFIX}/${safeJobId}.json`;
}

function isStorageNotFoundMessage(message: string) {
  const normalized = normalizeText(message).toLowerCase();
  return normalized.includes('not found') || normalized.includes('status code 404') || normalized === '404';
}

async function withTimeout<T>(label: string, timeoutMs: number, work: () => Promise<T>) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${Math.max(1, Math.floor(timeoutMs / 1000))}s`)), timeoutMs);
  });
  try {
    return await Promise.race([work(), timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number, label: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`${label} timed out after ${Math.max(1, Math.floor(timeoutMs / 1000))}s`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function readJsonResponse(res: Response) {
  const rawBody = await res.text().catch(() => '');
  const json = (parseJsonObject(rawBody) || {}) as JsonRecord;
  return { rawBody, json };
}

async function readJobStatusFromStorage(jobId: string, label: string, timeoutMs: number): Promise<JsonRecord | null> {
  const admin = getAdminSupabaseClient();
  const { data, error } = await withTimeout(label, timeoutMs, () =>
    admin.storage.from(DOCLING_JOB_STATUS_BUCKET).download(jobStatusObjectPath(jobId)),
  );
  if (error) {
    if (isStorageNotFoundMessage(error.message)) return null;
    throw new Error(error.message);
  }
  const raw = await withTimeout(`${label} read`, timeoutMs, () => data.text());
  return (parseJsonObject(raw) || {}) as JsonRecord;
}

async function runLegacySyncConvert(options: DoclingConvertOptions): Promise<DoclingConvertResult> {
  const timeoutMs = Math.max(10_000, Math.min(options.timeoutMs, 180_000));
  const res = await fetchWithTimeout(
    `${cleanBaseUrl(options.baseUrl)}/convert`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(options.payload),
    },
    timeoutMs,
    `Docling convert for ${options.payload.originalFilename}`,
  );
  const { rawBody, json } = await readJsonResponse(res);
  if (!res.ok) {
    const error = new Error(summarizeDoclingErrorBody(res.status, rawBody, json)) as Error & { status?: number };
    error.status = res.status;
    throw error;
  }
  return json as unknown as DoclingConvertResult;
}

function coerceResult(json: JsonRecord): DoclingConvertResult {
  const result = (json.result && typeof json.result === 'object' ? (json.result as JsonRecord) : json) as JsonRecord;
  const outputObjectPath = normalizeText(result.outputObjectPath);
  if (!outputObjectPath) throw new Error('Docling service returned no outputObjectPath');
  return {
    ok: Boolean(result.ok ?? true),
    userId: normalizeText(result.userId),
    bucketId: normalizeText(result.bucketId),
    inputObjectPath: normalizeText(result.inputObjectPath),
    outputObjectPath,
    outputFormat: normalizeText(result.outputFormat) === 'json' ? 'json' : 'markdown',
    imageManifestObjectPath: normalizeText(result.imageManifestObjectPath) || null,
    imageAssetCount: Number(result.imageAssetCount || 0) || 0,
  };
}

export async function runDoclingConvert(options: DoclingConvertOptions): Promise<DoclingConvertResult> {
  const baseUrl = cleanBaseUrl(options.baseUrl);
  const enqueueAttempts = Math.max(1, Math.min(4, Number(options.enqueueAttempts || 3)));
  const pollIntervalMs = Math.max(500, Math.min(5_000, Number(options.pollIntervalMs || 1_500)));
  const deadline = Date.now() + Math.max(10_000, options.timeoutMs);
  let jobId = normalizeText(options.payload.jobId);
  if (!jobId) throw new Error('Missing Docling jobId');

  let enqueueError: Error | null = null;
  for (let attempt = 1; attempt <= enqueueAttempts; attempt += 1) {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) break;
    try {
      const requestTimeoutMs = Math.max(5_000, Math.min(30_000, remainingMs));
      const res = await fetchWithTimeout(
        `${baseUrl}/convert/jobs`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ ...options.payload, jobId }),
        },
        requestTimeoutMs,
        `Docling enqueue for ${options.payload.originalFilename}`,
      );
      if ([404, 405, 501].includes(res.status)) {
        return runLegacySyncConvert(options);
      }
      const { rawBody, json } = await readJsonResponse(res);
      if (!res.ok) {
        const error = new Error(summarizeDoclingErrorBody(res.status, rawBody, json)) as Error & { status?: number };
        error.status = res.status;
        throw error;
      }
      jobId = normalizeText(json.jobId) || jobId;
      break;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      enqueueError = err;
      const status = typeof (err as { status?: unknown }).status === 'number' ? Number((err as { status?: unknown }).status) : NaN;
      if (attempt >= enqueueAttempts || (!Number.isFinite(status) || !isTransientStatus(status)) && !isTransientMessage(err.message)) {
        throw err;
      }
      await sleep(1_000 * attempt);
    }
  }

  if (enqueueError && Date.now() >= deadline) {
    throw enqueueError;
  }

  let notFoundCount = 0;
  for (;;) {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      throw new Error(
        `Docling convert for ${options.payload.originalFilename} timed out after ${Math.max(1, Math.floor(options.timeoutMs / 1000))}s`,
      );
    }
    try {
      const requestTimeoutMs = Math.max(5_000, Math.min(20_000, remainingMs));
      const json = await readJobStatusFromStorage(jobId, `Docling status for ${options.payload.originalFilename}`, requestTimeoutMs);
      if (!json && notFoundCount < 6) {
        notFoundCount += 1;
        await sleep(Math.min(pollIntervalMs, Math.max(250, remainingMs)));
        continue;
      }
      if (!json) throw new Error('Docling job status not found in shared storage');

      const status = normalizeText(json.status).toLowerCase();
      if (status === 'done') return coerceResult(json);
      if (status === 'error') {
        const detail = normalizeText(json.detail || json.error || json.message) || 'Docling conversion failed';
        const error = new Error(detail) as Error & { status?: number };
        const statusCode = Number(json.statusCode || 0);
        if (Number.isFinite(statusCode) && statusCode > 0) error.status = statusCode;
        throw error;
      }

      await sleep(Math.min(pollIntervalMs, Math.max(250, remainingMs)));
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      if (!isTransientMessage(err.message)) throw err;
      await sleep(Math.min(pollIntervalMs, Math.max(250, remainingMs)));
    }
  }
}
