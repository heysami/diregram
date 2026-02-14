export function buildNoteHeadingCommentTargetKey(params: { slug: string; occurrence: number }): string {
  const slug = String(params.slug || '').trim() || 'section';
  const occ = Math.max(1, Math.round(Number(params.occurrence) || 1));
  return `note:h:${slug}:${occ}`;
}

export function parseNoteHeadingIdToKey(headingId: string): { targetKey: string; slug: string; occurrence: number } | null {
  // `NoteEditor` generates ids like `h-<slug>-<n>`
  const id = String(headingId || '').trim();
  const m = id.match(/^h-([a-z0-9-]+)-(\d+)$/i);
  if (!m) return null;
  const slug = String(m[1] || '').toLowerCase();
  const occurrence = Number.parseInt(String(m[2] || '1'), 10);
  if (!slug) return null;
  if (!Number.isFinite(occurrence) || occurrence <= 0) return null;
  return { targetKey: buildNoteHeadingCommentTargetKey({ slug, occurrence }), slug, occurrence };
}

export function buildNoteEmbedCommentTargetKey(embedId: string): string {
  const id = String(embedId || '').trim();
  return `note:embed:${id || 'unknown'}`;
}

