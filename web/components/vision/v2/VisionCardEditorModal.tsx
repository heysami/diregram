'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import type { Editor, TLEditorSnapshot } from 'tldraw';
import { TldrawTileEditor } from '@/components/vision/tldraw/TldrawTileEditor';
import { upsertTemplateHeader, type NexusTemplateHeader } from '@/lib/nexus-template';
import { SaveTemplateModal } from '@/components/templates/SaveTemplateModal';
import { useCaptureModShortcut } from '@/hooks/use-capture-mod-shortcut';

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
  onSaveTemplateFile,
  templateSourceLabel,
  globalTemplatesEnabled,
}: {
  fileId: string;
  cardId: string;
  editor: Editor;
  onClose: () => void;
  onSaveTemplateFile?: (res: { name: string; content: string; scope?: 'project' | 'account' }) => Promise<void> | void;
  templateSourceLabel?: string;
  globalTemplatesEnabled?: boolean;
}) {
  const latestEditorRef = useRef(editor);
  const tileEditorRef = useRef<Editor | null>(null);
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
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [pendingTemplatePayload, setPendingTemplatePayload] = useState<string | null>(null);
  const [pendingTemplateHeaderBase, setPendingTemplateHeaderBase] = useState<Omit<NexusTemplateHeader, 'name'> | null>(null);
  const [pendingTemplateDefaultName, setPendingTemplateDefaultName] = useState<string>('Template');

  useCaptureModShortcut({
    key: 'd',
    enabled: true,
    onTrigger: (e) => {
      // Card editor is a modal overlay; never allow keyboard shortcuts to leak into the underlying main canvas.
      // If there is a tile selection, perform the duplicate inside the tile editor.
      try {
        e.preventDefault();
        e.stopPropagation();
        (e as any).stopImmediatePropagation?.();
      } catch {
        // ignore
      }

      const tileEd = tileEditorRef.current;
      if (!tileEd) return;
      let tileSel: string[] = [];
      try {
        tileSel = (tileEd.getSelectedShapeIds?.() as any) || [];
      } catch {
        tileSel = [];
      }
      if (!tileSel || tileSel.length === 0) return;
      try {
        (tileEd as any).duplicateShapes?.(tileSel as any, { x: 16, y: 16 } as any);
      } catch {
        // ignore
      }
    },
  });

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    };
  }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => {
      toastTimerRef.current = null;
      setToast(null);
    }, 1600);
  };

  return (
    <div className="fixed inset-0 z-[10000] bg-white text-black flex flex-col">
      <div className="h-12 px-3 border-b flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            className="h-8 px-2 border bg-white flex items-center gap-2"
            onClick={() => {
              onClose();
            }}
            title="Back to canvas"
          >
            <ArrowLeft size={16} />
            <span className="text-sm">Canvas</span>
          </button>
          <div className="font-semibold truncate">{title || 'Card'}</div>
          <div className="text-xs opacity-70 whitespace-nowrap">{cardId}</div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="h-8 px-2 border bg-white text-sm"
            disabled={!onSaveTemplateFile || !card}
            title={!onSaveTemplateFile ? 'Template actions are not available.' : 'Save this card as a template.'}
            onClick={async () => {
              if (!onSaveTemplateFile) return;
              if (!card) return;
              const w = Number(card?.props?.w || 360);
              const h = Number(card?.props?.h || 240);
              const rawThumb = typeof card?.props?.thumb === 'string' ? String(card.props.thumb) : '';
              const safeThumb = rawThumb && rawThumb.length <= MAX_THUMB_CHARS ? rawThumb : undefined;
              const tileSnapshot = typeof card?.props?.tileSnapshot === 'string' ? String(card.props.tileSnapshot) : undefined;
              const tpl = {
                version: 1,
                props: {
                  w: Number.isFinite(w) ? w : 360,
                  h: Number.isFinite(h) ? h : 240,
                  ...(title ? { title } : null),
                  ...(safeThumb ? { thumb: safeThumb } : null),
                  ...(tileSnapshot ? { tileSnapshot } : null),
                },
              };
              const payload = ['```nexus-vision-card', JSON.stringify(tpl, null, 2), '```', ''].join('\n');
              const headerBase: Omit<NexusTemplateHeader, 'name'> = {
                version: 1,
                ...(templateSourceLabel ? { description: `Saved from ${templateSourceLabel}` } : {}),
                targetKind: 'vision',
                mode: 'appendFragment',
                fragmentKind: 'visionCard',
                tags: ['vision'],
              };
              setPendingTemplatePayload(payload);
              setPendingTemplateHeaderBase(headerBase);
              setPendingTemplateDefaultName(title || 'Vision card');
              setSaveTemplateOpen(true);
            }}
          >
            Save template
          </button>
        </div>
      </div>

      {toast ? (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-[11000] mac-window mac-shadow-hard text-xs px-3 py-2">
          {toast}
        </div>
      ) : null}

      <SaveTemplateModal
        open={saveTemplateOpen}
        title="Save template"
        defaultName={pendingTemplateDefaultName}
        defaultScope="project"
        onClose={() => setSaveTemplateOpen(false)}
        onSave={async ({ name, scope }) => {
          if (!onSaveTemplateFile) throw new Error('Template saving unavailable.');
          if (!pendingTemplatePayload || !pendingTemplateHeaderBase) throw new Error('No template content to save.');
          const header: NexusTemplateHeader = { ...pendingTemplateHeaderBase, name };
          const content = upsertTemplateHeader(pendingTemplatePayload, header);
          await onSaveTemplateFile({ name, content, scope });
          setPendingTemplatePayload(null);
          setPendingTemplateHeaderBase(null);
          showToast('Template saved');
        }}
      />

      <div className="flex-1 overflow-hidden">
        <TldrawTileEditor
          initialSnapshot={initialSnapshot}
          sessionStorageKey={`vision:tldraw:card:session:${fileId}:${cardId}`}
          thumbOutPx={256}
          onMountEditor={(ed) => {
            tileEditorRef.current = ed;
          }}
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

