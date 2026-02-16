import { upsertHeader } from '@/lib/nexus-doc-header';
import { defaultVisionDoc, saveVisionDoc } from '@/lib/visionjson';

/**
 * Minimal starter content for a Vision document.
 *
 * v2: a nexus-doc header + a single visionjson block (tldraw canvas snapshot).
 */
export function makeStarterVisionMarkdown(): string {
  const withHeader = upsertHeader('', { kind: 'vision', version: 2 });
  return saveVisionDoc(withHeader, defaultVisionDoc());
}

