import type { AsyncJobRow } from '@/lib/server/async-jobs/types';
import { runRagIngestJob } from '@/lib/server/async-jobs/processors/rag';
import { runDoclingConvertJob } from '@/lib/server/async-jobs/processors/docling';

export async function runAsyncJob(job: AsyncJobRow): Promise<Record<string, unknown>> {
  if (job.kind === 'rag_ingest' || job.kind === 'rag_ingest_jwt') {
    return runRagIngestJob(job);
  }
  if (job.kind === 'docling_convert') {
    return runDoclingConvertJob(job);
  }
  throw new Error(`Unsupported async job kind: ${job.kind}`);
}
