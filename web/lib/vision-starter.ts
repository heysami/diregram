import { upsertHeader } from '@/lib/nexus-doc-header';
import { defaultVisionDoc, saveVisionDoc } from '@/lib/visionjson';

/**
 * Minimal starter content for a Vision document.
 *
 * v2: a nexus-doc header + a single visionjson block (tldraw canvas snapshot).
 */
export function makeStarterVisionMarkdown(): string {
  // NOTE: this is the *outer* nexus-doc header version, not the embedded Vision doc version.
  // Vision v2 lives inside the ```visionjson payload.
  const withHeader = upsertHeader('', { kind: 'vision', version: 1 });
  return saveVisionDoc(withHeader, defaultVisionDoc());
}

