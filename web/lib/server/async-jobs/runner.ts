import type { AsyncJobRow } from '@/lib/server/async-jobs/types';
import { runRagIngestJob } from '@/lib/server/async-jobs/processors/rag';
import { runDoclingConvertJob } from '@/lib/server/async-jobs/processors/docling';
import { runAiFileGenerationJob } from '@/lib/server/async-jobs/processors/ai-file-generation';
import { runAiGridRuleJob } from '@/lib/server/async-jobs/processors/ai-grid-rule';
import { runAiDiagramAssistJob } from '@/lib/server/async-jobs/processors/ai-diagram-assist';

export async function runAsyncJob(job: AsyncJobRow): Promise<Record<string, unknown>> {
  if (job.kind === 'rag_ingest' || job.kind === 'rag_ingest_jwt') {
    return runRagIngestJob(job);
  }
  if (job.kind === 'docling_convert') {
    return runDoclingConvertJob(job);
  }
  if (job.kind === 'ai_file_generation') {
    return runAiFileGenerationJob(job);
  }
  if (job.kind === 'ai_grid_rule') {
    return runAiGridRuleJob(job);
  }
  if (job.kind === 'ai_diagram_assist') {
    return runAiDiagramAssistJob(job);
  }
  throw new Error(`Unsupported async job kind: ${job.kind}`);
}
