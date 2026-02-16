import { upsertHeader } from '@/lib/nexus-doc-header';
import { defaultVisionDoc, saveVisionDoc } from '@/lib/visionjson';

/**
 * Minimal starter content for a Vision document.
 *
 * v1: a nexus-doc header + a single visionjson block (sparse 24×24 grid).
 */
export function makeStarterVisionMarkdown(): string {
  const withHeader = upsertHeader('', { kind: 'vision', version: 1 });
  return saveVisionDoc(withHeader, defaultVisionDoc());
}

