import { normalizeMarkdownNewlines } from '@/lib/markdown-normalize';
import { readHeader } from '@/lib/nexus-doc-header';

export type VisionImportIssue = { level: 'error' | 'warning'; message: string };

function countVisionJsonBlocks(md: string): number {
  const re = /```visionjson[ \t]*\n/g;
  let n = 0;
  for (;;) {
    const m = re.exec(md);
    if (!m) break;
    n += 1;
  }
  return n;
}

function extractVisionJsonPayload(markdown: string): string | null {
  const text = String(markdown || '').replace(/\r\n?/g, '\n');
  const start = text.indexOf('```visionjson');
  if (start < 0) return null;
  const afterFenceNl = text.indexOf('\n', start);
  if (afterFenceNl < 0) return null;
  const endFence = text.indexOf('\n```', afterFenceNl + 1);
  if (endFence < 0) return null;
  const payload = text.slice(afterFenceNl + 1, endFence).trim();
  return payload || null;
}

export function validateVisionMarkdownImport(md: string): { errors: VisionImportIssue[]; warnings: VisionImportIssue[]; reportText: string } {
  const errors: VisionImportIssue[] = [];
  const warnings: VisionImportIssue[] = [];
  const text = normalizeMarkdownNewlines(String(md || ''));

  const { header } = readHeader(text);
  if (!header) errors.push({ level: 'error', message: 'Missing or invalid ```nexus-doc header at top (must be kind:"vision", version:1).' });
  else {
    if (header.kind !== 'vision') errors.push({ level: 'error', message: `nexus-doc kind must be "vision" (got "${header.kind}").` });
    if (header.version !== 1) errors.push({ level: 'error', message: `nexus-doc version must be 1 (got ${String(header.version)}).` });
  }

  const visionjsonCount = countVisionJsonBlocks(text);
  if (visionjsonCount !== 1) errors.push({ level: 'error', message: `Expected exactly ONE \`\`\`visionjson block (found ${visionjsonCount}).` });

  const payload = extractVisionJsonPayload(text);
  if (!payload) errors.push({ level: 'error', message: 'Missing visionjson payload.' });
  else {
    try {
      const parsed = JSON.parse(payload) as any;
      const v = Number(parsed?.version);
      if (v !== 2) errors.push({ level: 'error', message: `visionjson payload must be version:2 (got ${String(parsed?.version)}).` });
      const payloadChars = payload.length;
      if (payloadChars > 250_000) warnings.push({ level: 'warning', message: `visionjson payload is large (${payloadChars.toLocaleString()} chars). Large snapshots can freeze the browser.` });
    } catch {
      errors.push({ level: 'error', message: 'visionjson payload is not valid JSON.' });
    }
  }

  const reportText = [
    'Vision import validation report',
    `Errors: ${errors.length}`,
    `Warnings: ${warnings.length}`,
    '',
    ...errors.map((e) => `ERROR: ${e.message}`),
    ...warnings.map((w) => `WARN: ${w.message}`),
    '',
  ].join('\n');

  return { errors, warnings, reportText };
}

