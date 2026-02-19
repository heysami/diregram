'use client';

import { useEffect } from 'react';
import type { EditorView } from '@tiptap/pm/view';
import { isBlockedCrossFilePaste, readInternalClipboardEnvelope, writeInternalClipboardEnvelope } from '@/lib/nexus-internal-clipboard';
import { replaceSelectionWithHtml, serializeProseMirrorSelection } from '@/components/note/tiptap/clipboard';

type EditorWithView = { view?: EditorView };

export function useNoteInternalClipboardGuard(opts: {
  editor: EditorWithView | null;
  editorViewReadyTick: number;
  /** Current file id; used to prevent internal pastes across different files. */
  fileId: string;
  onBlockedPaste: (msg: string) => void;
}) {
  const { editor, editorViewReadyTick, fileId, onBlockedPaste } = opts;

  // Internal clipboard stamping + cross-file paste blocking (do not interfere with rich copy/paste).
  useEffect(() => {
    if (!editor) return;
    if (editorViewReadyTick <= 0) return;
    const activeFileId = String(fileId || '').trim();
    if (!activeFileId) return;

    let dom: HTMLElement | null = null;
    try {
      dom = editor.view?.dom || null;
    } catch {
      dom = null;
    }
    if (!dom) return;

    const onCopy = () => {
      try {
        // IMPORTANT: do not touch clipboardData here (preserve rich HTML copy/paste).
        const view = editor.view;
        if (!view) return;
        const sel = serializeProseMirrorSelection(view);
        writeInternalClipboardEnvelope(null, {
          kind: 'noteRich',
          fileId: activeFileId,
          plainText: sel?.text || '',
          payload: { html: sel?.html || '' },
        });
      } catch {
        // ignore
      }
    };

    const onCut = () => {
      onCopy();
    };

    const onPaste = (e: ClipboardEvent) => {
      const env = readInternalClipboardEnvelope(e);
      if (env && env.kind === 'noteRich' && isBlockedCrossFilePaste(env, activeFileId)) {
        e.preventDefault();
        onBlockedPaste(`Can't paste across different files.`);
        return;
      }

      // Fallback: if clipboard has no HTML but we have same-file internal HTML, paste that.
      try {
        const html = String(e.clipboardData?.getData('text/html') || '').trim();
        const memHtml = (() => {
          if (!env || env.kind !== 'noteRich' || env.fileId !== activeFileId) return '';
          const p = env.payload as unknown;
          if (!p || typeof p !== 'object') return '';
          const rec = p as Record<string, unknown>;
          return String(rec.html || '').trim();
        })();
        if (!html && memHtml) {
          const view = editor.view;
          if (view && replaceSelectionWithHtml(view, memHtml)) {
            e.preventDefault();
            return;
          }
        }
      } catch {
        // ignore
      }

      // Default rich paste behavior is implemented in ProseMirror `handlePaste` (see `tiptap/editor.ts`).
    };

    dom.addEventListener('copy', onCopy);
    dom.addEventListener('cut', onCut);
    dom.addEventListener('paste', onPaste);
    return () => {
      dom?.removeEventListener('copy', onCopy);
      dom?.removeEventListener('cut', onCut);
      dom?.removeEventListener('paste', onPaste);
    };
  }, [editor, editorViewReadyTick, fileId, onBlockedPaste]);
}

