'use client';

export const NOTE_OPEN_COMMENT_TARGET_EVENT = 'note:openCommentTarget' as const;

export type NoteOpenCommentTargetDetail = {
  targetKey: string;
  targetLabel?: string;
};

export function dispatchNoteOpenCommentTarget(detail: NoteOpenCommentTargetDetail) {
  const targetKey = String(detail?.targetKey || '').trim();
  if (!targetKey) return;
  try {
    window.dispatchEvent(
      new CustomEvent<NoteOpenCommentTargetDetail>(NOTE_OPEN_COMMENT_TARGET_EVENT, {
        detail: { targetKey, targetLabel: detail?.targetLabel },
      }),
    );
  } catch {
    // ignore
  }
}

export function listenNoteOpenCommentTarget(cb: (detail: NoteOpenCommentTargetDetail) => void): () => void {
  const handler = (e: Event) => {
    const ce = e as CustomEvent<NoteOpenCommentTargetDetail>;
    const d = ce?.detail;
    if (!d || !String(d.targetKey || '').trim()) return;
    cb({ targetKey: String(d.targetKey || '').trim(), targetLabel: d.targetLabel });
  };
  window.addEventListener(NOTE_OPEN_COMMENT_TARGET_EVENT, handler as any);
  return () => window.removeEventListener(NOTE_OPEN_COMMENT_TARGET_EVENT, handler as any);
}

