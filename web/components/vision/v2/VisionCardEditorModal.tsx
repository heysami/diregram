'use client';

import { useEffect, useMemo, useRef } from 'react';
import { ArrowLeft } from 'lucide-react';
import type { Editor, TLEditorSnapshot } from 'tldraw';
import { TldrawTileEditor } from '@/components/vision/tldraw/TldrawTileEditor';

function safeJsonParse<T = unknown>(s: string): T | null {
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

export function VisionCardEditorModal({
  fileId,
  cardId,
  editor,
  onClose,
}: {
  fileId: string;
  cardId: string;
  editor: Editor;
  onClose: () => void;
}) {
  const latestEditorRef = useRef(editor);
  useEffect(() => {
    latestEditorRef.current = editor;
  }, [editor]);

  const card = useMemo<any>(() => {
    try {
      return (editor as any).getShape?.(cardId) || null;
    } catch {
      return null;
    }
  }, [editor, cardId]);

  const initialSnapshot = useMemo<Partial<TLEditorSnapshot> | null>(() => {
    const raw = String(card?.props?.tileSnapshot || '').trim();
    if (!raw) return null;
    const parsed = safeJsonParse<any>(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed as Partial<TLEditorSnapshot>;
  }, [card?.props?.tileSnapshot]);

  const title = typeof card?.props?.title === 'string' ? String(card.props.title).trim() : '';

  // Keep thumbs bounded; markdown persistence can get large quickly.
  const MAX_THUMB_CHARS = 400_000;

  return (
    <div className="fixed inset-0 z-[10000] bg-white text-black flex flex-col">
      <div className="h-12 px-3 border-b flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <button type="button" className="h-8 px-2 border bg-white flex items-center gap-2" onClick={onClose} title="Back to canvas">
            <ArrowLeft size={16} />
            <span className="text-sm">Canvas</span>
          </button>
          <div className="font-semibold truncate">{title || 'Card'}</div>
          <div className="text-xs opacity-70 whitespace-nowrap">{cardId}</div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        <TldrawTileEditor
          initialSnapshot={initialSnapshot}
          sessionStorageKey={`vision:tldraw:card:session:${fileId}:${cardId}`}
          thumbOutPx={256}
          onChange={({ snapshot, thumbPngDataUrl }) => {
            const ed = latestEditorRef.current;
            if (!ed) return;
            const nextSnapStr = JSON.stringify(snapshot || {});
            const safeThumb = thumbPngDataUrl && thumbPngDataUrl.length <= MAX_THUMB_CHARS ? String(thumbPngDataUrl) : undefined;
            try {
              (ed as any).updateShapes?.([
                {
                  id: cardId,
                  type: 'nxcard',
                  props: {
                    tileSnapshot: nextSnapStr,
                    ...(safeThumb ? { thumb: safeThumb } : null),
                  },
                },
              ]);
            } catch {
              // ignore
            }
          }}
        />
      </div>
    </div>
  );
}

