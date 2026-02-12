import * as Y from 'yjs';
import { encodeNewlines, decodeNewlines } from '@/lib/newline-encoding';

const ANN_COMMENT_RE = /<!--\s*ann:([^>]*)\s*-->/;

export function extractAnnotationFromLine(line: string): string | undefined {
  const m = line.match(ANN_COMMENT_RE);
  if (!m) return undefined;
  const raw = (m[1] || '').trim();
  if (!raw) return undefined;
  try {
    const decoded = decodeURIComponent(raw);
    const out = decodeNewlines(decoded);
    return out.trim() ? out : undefined;
  } catch {
    const out = decodeNewlines(raw);
    return out.trim() ? out : undefined;
  }
}

export function stripAnnotationComment(line: string): string {
  return line.replace(/\s*<!--\s*ann:[^>]*\s*-->\s*/g, ' ').replace(/\s+$/g, '');
}

export function upsertAnnotationComment(line: string, annotation: string | null | undefined): string {
  const cleaned = stripAnnotationComment(line);
  const next = (annotation ?? '').trim();
  if (!next) return cleaned;
  // URL-encode so we never leak ">" into the HTML comment payload.
  const payload = encodeURIComponent(encodeNewlines(next));
  return `${cleaned} <!-- ann:${payload} -->`;
}

export function saveNodeAnnotation(opts: {
  doc: Y.Doc;
  lineIndex: number;
  annotation: string | null | undefined;
}): void {
  const { doc, lineIndex, annotation } = opts;
  const yText = doc.getText('nexus');
  const current = yText.toString();
  const lines = current.split('\n');
  if (lineIndex < 0 || lineIndex >= lines.length) return;
  const updated = upsertAnnotationComment(lines[lineIndex], annotation);
  if (updated === lines[lineIndex]) return;
  lines[lineIndex] = updated;
  const next = lines.join('\n');
  if (next === current) return;
  doc.transact(() => {
    yText.delete(0, yText.length);
    yText.insert(0, next);
  });
}

