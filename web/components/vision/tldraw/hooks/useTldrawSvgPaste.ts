'use client';

import { useEffect } from 'react';
import { isBlockedCrossFilePaste, readInternalClipboardEnvelope, writeInternalClipboardEnvelope } from '@/lib/nexus-internal-clipboard';
import { importSvgAsEditableNxpath } from '@/components/vision/tldraw/svg/importSvgAsEditableNxpath';

type EditorLike = {
  getCurrentPageShapeIds?: () => unknown[] | undefined;
  getShape?: (id: unknown) => { type?: unknown } | null | undefined;
  deleteShapes?: (ids: unknown[]) => void;
};

function looksLikeSvg(text: string): boolean {
  const s = String(text || '').trim();
  if (!s) return false;
  return s.startsWith('<svg') || s.includes('<svg');
}

export function useTldrawSvgPaste(opts: {
  editor: unknown;
  /** Current file id; used to prevent internal pastes across different files. */
  fileId?: string | null;
  isProbablyActive: () => boolean;
  topToast: { show: (msg: string) => void };
}) {
  const { editor, fileId, isProbablyActive, topToast } = opts;

  useEffect(() => {
    if (!editor) return;
    const ed = editor as EditorLike;
    const activeFileId = String(fileId || '').trim();

    const onCopy = (e: ClipboardEvent) => {
      // Do NOT override clipboard contents; tldraw uses its own internal formats for in-editor copy/paste.
      // We only stamp an internal envelope (in memory) so we can block cross-file pastes.
      if (!activeFileId) return;
      if (!isProbablyActive()) return;
      let plain = '';
      try {
        plain = String(e.clipboardData?.getData('text/plain') || '');
      } catch {
        plain = '';
      }
      writeInternalClipboardEnvelope(null, { kind: 'visionSvg', fileId: activeFileId, plainText: plain, payload: {} });
    };

    const onCut = (e: ClipboardEvent) => {
      onCopy(e);
    };

    const onPaste = (e: ClipboardEvent) => {
      if (!isProbablyActive()) return;

      const beforePageIds = (() => {
        try {
          const ids = ed.getCurrentPageShapeIds?.();
          return new Set(Array.isArray(ids) ? ids.map((x) => String(x)) : []);
        } catch {
          return new Set<string>();
        }
      })();

      const activeId = String(fileId || '').trim();
      const env = readInternalClipboardEnvelope(e);
      if (env && env.kind === 'visionSvg' && activeId && isBlockedCrossFilePaste(env, activeId)) {
        e.preventDefault();
        topToast.show(`Can't paste across different files.`);
        return;
      }

      const svgFromClipboard = (() => {
        try {
          const direct = String(e.clipboardData?.getData?.('image/svg+xml') || '').trim();
          if (direct) return direct;
        } catch {
          // ignore
        }
        return '';
      })();

      if (svgFromClipboard) {
        if (importSvgAsEditableNxpath(editor, svgFromClipboard, { nxName: 'PastedSVG' })) {
          try {
            e.preventDefault();
            e.stopPropagation();
            (e as unknown as { stopImmediatePropagation?: () => void }).stopImmediatePropagation?.();
          } catch {
            // ignore
          }
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              try {
                const ids = (editor as EditorLike).getCurrentPageShapeIds?.();
                const afterIds = Array.isArray(ids) ? ids.map((x) => String(x)) : [];
                const added = afterIds.filter((id: string) => !beforePageIds.has(id));
                const addedImage = added.filter((id: string) => String((editor as EditorLike).getShape?.(id)?.type || '') === 'image');
                if (addedImage.length) {
                  (editor as EditorLike).deleteShapes?.(addedImage);
                }
              } catch {
                // ignore
              }
            });
          });
        }
        return;
      }

      const text = (() => {
        try {
          return String(e.clipboardData?.getData('text/plain') || '');
        } catch {
          return '';
        }
      })();
      if (!looksLikeSvg(text)) return;

      // Paste SVG code (external allowed; internal allowed only within same file).
      if (importSvgAsEditableNxpath(editor, text, { nxName: 'PastedSVG' })) {
        try {
          e.preventDefault();
          e.stopPropagation();
          (e as unknown as { stopImmediatePropagation?: () => void }).stopImmediatePropagation?.();
        } catch {
          // ignore
        }
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            try {
              const ids = (editor as EditorLike).getCurrentPageShapeIds?.();
              const afterIds = Array.isArray(ids) ? ids.map((x) => String(x)) : [];
              const added = afterIds.filter((id: string) => !beforePageIds.has(id));
              const addedImage = added.filter((id: string) => String((editor as EditorLike).getShape?.(id)?.type || '') === 'image');
              if (addedImage.length) {
                (editor as EditorLike).deleteShapes?.(addedImage);
              }
            } catch {
              // ignore
            }
          });
        });
      }
    };

    document.addEventListener('copy', onCopy);
    document.addEventListener('cut', onCut);
    // Capture phase so we can preempt tldraw's own paste handlers.
    document.addEventListener('paste', onPaste, { capture: true });
    return () => {
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('cut', onCut);
      document.removeEventListener('paste', onPaste, true);
    };
  }, [editor, fileId, isProbablyActive, topToast]);
}

