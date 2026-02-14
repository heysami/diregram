'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Y from 'yjs';
import type { HocuspocusProvider } from '@hocuspocus/provider';
import { EditorContent } from '@tiptap/react';
import { MessageSquare } from 'lucide-react';
import { TextSelection } from '@tiptap/pm/state';
import { CommentsPanel } from '@/components/CommentsPanel';
import { useNoteEditor } from '@/components/note/tiptap/editor';
import { parseMarkdownToTiptap, serializeTiptapToMarkdown } from '@/components/note/tiptap/markdownCodec';
import { useNoteDragHandle } from '@/components/note/drag/useNoteDragHandle';
import { SlashMenu } from '@/components/note/slash/SlashMenu';
import { useNoteSlashMenu } from '@/components/note/slash/useNoteSlashMenu';
import { runNoteSlashCommand } from '@/components/note/slash/runNoteSlashCommand';
import { EditorMenubar } from '@/components/EditorMenubar';
import { buildNoteEmbedCommentTargetKey, buildNoteHeadingCommentTargetKey } from '@/lib/note-comments';
import { listenNoteOpenCommentTarget } from '@/components/note/comments/noteCommentEvents';
import { useYDocThreads } from '@/components/note/comments/useYDocThreads';

type HeadingEntry = { level: number; text: string; pos: number; targetKey: string; slug: string; occurrence: number };

function slugifyHeading(text: string): string {
  return (
    String(text || '')
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'section'
  );
}

function safeCssEscape(s: string): string {
  const v = String(s || '');
  // `CSS.escape` exists in modern browsers, but keep a fallback for safety.
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const esc = (globalThis as any)?.CSS?.escape as ((x: string) => string) | undefined;
    if (typeof esc === 'function') return esc(v);
  } catch {
    // ignore
  }
  return v.replace(/["\\]/g, '\\$&');
}

export function NoteEditor({
  yDoc,
  provider,
  title,
  statusLabel,
  onBack,
  commentPanel,
  onCommentPanelChange,
}: {
  yDoc: Y.Doc;
  provider: HocuspocusProvider | null;
  title: string;
  statusLabel: string;
  onBack: () => void;
  commentPanel: { targetKey: string | null; targetLabel?: string; scrollToThreadId?: string };
  onCommentPanelChange: (next: { targetKey: string | null; targetLabel?: string; scrollToThreadId?: string }) => void;
}) {
  const [activeTool, setActiveTool] = useState<'select' | 'comment'>('select');
  const allThreads = useYDocThreads(yDoc);

  const scrollRef = useRef<HTMLDivElement>(null);
  const didHydrateRef = useRef(false);
  const [hydrated, setHydrated] = useState(false);
  const exportTimerRef = useRef<number | null>(null);
  const [editorViewReadyTick, setEditorViewReadyTick] = useState(0);

  const editor = useNoteEditor({
    yDoc,
    provider,
    user: { id: 'local', name: 'You' },
  });

  // When switching files, `yDoc` changes but this component instance can be reused.
  // Reset hydration/export guards so the new doc doesn't get stuck blank.
  useEffect(() => {
    didHydrateRef.current = false;
    setHydrated(false);
    if (exportTimerRef.current) window.clearTimeout(exportTimerRef.current);
    exportTimerRef.current = null;
    // Bump tick so any editor-view-dependent effects re-evaluate after mount.
    setEditorViewReadyTick((t) => t + 1);
  }, [yDoc]);

  // TipTap can exist before the ProseMirror view is mounted. Avoid crashing on `editor.view` access.
  useEffect(() => {
    if (!editor) return;
    let cancelled = false;
    const markReady = () => {
      if (cancelled) return;
      try {
        // TipTap throws if the view isn't mounted yet.
        const dom = (editor as any).view?.dom as HTMLElement | undefined;
        if (dom) setEditorViewReadyTick((t) => t + 1);
      } catch {
        // ignore
      }
    };
    const onCreate = () => markReady();
    editor.on('create', onCreate);
    // Best-effort: check next frame as well.
    try {
      window.requestAnimationFrame(markReady);
    } catch {
      // ignore
    }
    return () => {
      cancelled = true;
      editor.off('create', onCreate);
    };
  }, [editor]);

  const editorWrapRef = useRef<HTMLDivElement>(null);
  const { dragHandle, onHandleMouseDown, onHandleDragStart, onHandleDragEnd } = useNoteDragHandle({
    editor,
    editorViewReadyTick,
    editorWrapRef,
    scrollRef,
  });

  const slashItems = useMemo(
    () => [
      { id: 'h1', label: 'Heading 1' },
      { id: 'h2', label: 'Heading 2' },
      { id: 'h3', label: 'Heading 3' },
      { id: 'bullet', label: 'Bulleted list' },
      { id: 'ordered', label: 'Numbered list' },
      { id: 'todo', label: 'Todo list' },
      { id: 'quote', label: 'Quote' },
      { id: 'code', label: 'Code block' },
      { id: 'hr', label: 'Divider' },
      { id: 'toggle', label: 'Toggle (collapsible)' },
      { id: 'box', label: 'Box (container)' },
      { id: 'tabs', label: 'Tabs' },
      { id: 'embed', label: 'Embed (diagram/flow/systemflow)' },
      { id: 'table', label: 'Embed table (grid)' },
      { id: 'test', label: 'Embed test' },
    ],
    [],
  );

  const slash = useNoteSlashMenu({
    editor,
    items: slashItems,
    onRunCommand: (cmd, ctx) => {
      if (!editor) return;
      runNoteSlashCommand({
        editor,
        cmd,
        slashPos: ctx.slashPos,
        setDebugText: ctx.setDebugText,
        setErrorText: ctx.setErrorText,
        onCloseMenu: ctx.close,
      });
    },
  });

  const pickSlashItem = (id: string) => {
    if (!editor) return;
    runNoteSlashCommand({
      editor,
      cmd: id,
      slashPos: slash.menu.pos,
      setDebugText: slash.setDebugText,
      setErrorText: slash.setErrorText,
      onCloseMenu: slash.close,
    });
  };

  // Hydrate the collaborative note fragment from canonical markdown snapshot (only if fragment is empty).
  useEffect(() => {
    if (!editor) return;
    if (didHydrateRef.current) return;
    const yText = yDoc.getText('nexus');

    const editorHasContent = () => {
      try {
        const md = serializeTiptapToMarkdown(editor.getJSON());
        return md.trim().length > 0;
      } catch {
        return false;
      }
    };

    const markHydrated = () => {
      didHydrateRef.current = true;
      setHydrated(true);
    };

    const tryHydrateFromMarkdown = () => {
      const md = yText.toString();
      const hasMd = md.trim().length > 0;
      const hasEditor = editorHasContent();

      // If the editor already has content, consider hydration complete.
      // (This covers "user typed quickly" and also cases where collaboration bootstraps
      // the note fragment with a trivial structure before markdown seed arrives.)
      if (hasEditor) {
        markHydrated();
        return true;
      }

      // If we have markdown but the editor is empty, hydrate from markdown now.
      if (!hasMd) return false;

      // If the user already started typing before the seed arrived, do NOT overwrite.
      const json = parseMarkdownToTiptap(md);
      // Set content once; collab extension will write into the fragment.
      editor.commands.setContent(json);
      markHydrated();
      return true;
    };

    // If markdown isn't ready yet (common when switching files), wait for the seed
    // rather than hydrating an empty doc and exporting that emptiness back.
    if (tryHydrateFromMarkdown()) return;

    let observing = true;
    const onText = () => {
      if (didHydrateRef.current) return;
      if (tryHydrateFromMarkdown()) {
        // Avoid double-unobserve warnings: mark as removed here so cleanup is a no-op.
        observing = false;
        yText.unobserve(onText);
      }
    };
    yText.observe(onText);

    // Fallback: if nothing ever seeds, allow editing/export after a short delay.
    const t = window.setTimeout(() => {
      if (didHydrateRef.current) return;
      const cur = yText.toString();
      if (!cur.trim()) {
        // New/blank note: allow exporting after a short grace period.
        markHydrated();
      }
    }, 900);

    return () => {
      if (observing) yText.unobserve(onText);
      try {
        window.clearTimeout(t);
      } catch {
        // ignore
      }
    };
  }, [editor, yDoc]);

  // Export editor state to canonical markdown in `Y.Text('nexus')` (debounced), so existing persistence keeps working.
  useEffect(() => {
    if (!editor) return;
    if (!hydrated) return;
    const yText = yDoc.getText('nexus');

    const exportNow = () => {
      const md = serializeTiptapToMarkdown(editor.getJSON());
      const cur = yText.toString();
      if (md === cur) return;
      yDoc.transact(() => {
        yText.delete(0, yText.length);
        yText.insert(0, md);
      });
    };

    const schedule = () => {
      if (exportTimerRef.current) window.clearTimeout(exportTimerRef.current);
      exportTimerRef.current = window.setTimeout(() => {
        exportTimerRef.current = null;
        exportNow();
      }, 250);
    };

    editor.on('update', schedule);
    // Also export once on ready (covers empty starter docs).
    schedule();

    return () => {
      editor.off('update', schedule);
      if (exportTimerRef.current) window.clearTimeout(exportTimerRef.current);
      exportTimerRef.current = null;
    };
  }, [editor, yDoc, hydrated]);

  // Headings for outline (temporary implementation: scan editor JSON).
  const headings = useMemo<HeadingEntry[]>(() => {
    if (!editor) return [];
    const doc = editor.state.doc;
    const out: HeadingEntry[] = [];
    const occBySlug = new Map<string, number>();
    doc.descendants((node, pos) => {
      if (node.type.name === 'heading') {
        const level = (node.attrs as any)?.level || 1;
        const text = node.textContent || 'Heading';
        const slug = slugifyHeading(text);
        const nextOcc = (occBySlug.get(slug) || 0) + 1;
        occBySlug.set(slug, nextOcc);
        out.push({
          level,
          text,
          pos,
          slug,
          occurrence: nextOcc,
          targetKey: buildNoteHeadingCommentTargetKey({ slug, occurrence: nextOcc }),
        });
      }
      return true;
    });
    return out;
  }, [editor, editor?.state.doc]);

  const [activeHeadingIdx, setActiveHeadingIdx] = useState<number>(-1);
  useEffect(() => {
    if (!editor) return;
    const root = scrollRef.current;
    if (!root) return;
    let container: HTMLElement | null = null;
    try {
      container = ((editor as any).view?.dom as HTMLElement | undefined) || null;
    } catch {
      container = null;
    }
    if (!container) return;
    const hs = Array.from(container.querySelectorAll('h1,h2,h3,h4,h5,h6')) as HTMLElement[];
    if (hs.length === 0) {
      setActiveHeadingIdx(-1);
      return;
    }
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => (a.boundingClientRect.top || 0) - (b.boundingClientRect.top || 0));
        const top = visible[0]?.target as HTMLElement | undefined;
        if (!top) return;
        const idx = hs.indexOf(top);
        if (idx >= 0) setActiveHeadingIdx(idx);
      },
      { root, rootMargin: '-20% 0px -70% 0px', threshold: [0, 1] },
    );
    hs.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [editor, headings.length, editorViewReadyTick]);

  const clickHeading = (pos: number, idx: number) => {
    if (!editor) return;
    editor.commands.setTextSelection(pos);
    editor.commands.focus();
    try {
      const hs = Array.from(editor.view.dom.querySelectorAll('h1,h2,h3,h4,h5,h6')) as HTMLElement[];
      const el = hs[idx] || null;
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch {
      // ignore
    }
  };

  const openTargetKey = useCallback(
    (info: { targetKey: string; targetLabel?: string }) => {
      onCommentPanelChange({ targetKey: info.targetKey, targetLabel: info.targetLabel });
      setActiveTool('comment');
    },
    [onCommentPanelChange],
  );

  const addRangeComment = () => {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    if (from === to) return;
    const id = crypto.randomUUID();
    // IMPORTANT: Don't use `setMark()` here because it sets "stored marks",
    // which would cause newly typed text to keep inheriting this comment id.
    // Instead, add the mark to the range via a transaction and then clear stored marks.
    editor.commands.command(({ state, tr, dispatch }) => {
      const markType = state.schema.marks.comment;
      if (!markType) return false;
      const a = Math.min(from, to);
      const b = Math.max(from, to);
      tr.addMark(a, b, markType.create({ id } as any));
      tr.setSelection(TextSelection.create(tr.doc, b));
      tr.setStoredMarks([]);
      if (dispatch) dispatch(tr);
      return true;
    });
    const text = editor.state.doc.textBetween(from, to, ' ', ' ').trim();
    onCommentPanelChange({ targetKey: `note:r:${id}`, targetLabel: text || 'Selection' });
    setActiveTool('comment');
  };

  // In comment mode, clicking headings/embeds opens a thread.
  useEffect(() => {
    if (!editor) return;
    if (editorViewReadyTick <= 0) return;

    let view: any = null;
    let dom: HTMLElement | null = null;
    try {
      view = (editor as any).view || null;
      dom = (view?.dom as HTMLElement | undefined) || null;
    } catch {
      view = null;
      dom = null;
    }
    if (!view || !dom) return;
    const onMouseDown = (e: MouseEvent) => {
      if (activeTool !== 'comment') return;

      // Range comment marks: clicking highlighted text should open the thread.
      try {
        const t = e.target as HTMLElement | null;
        const markEl = t?.closest?.('span[data-note-comment]') as HTMLElement | null;
        const id = String(markEl?.getAttribute?.('data-note-comment') || '').trim();
        if (id) {
          openTargetKey({ targetKey: `note:r:${id}`, targetLabel: 'Selection' });
          return;
        }
      } catch {
        // ignore
      }

      const res = view.posAtCoords({ left: e.clientX, top: e.clientY });
      if (!res) return;
      const pos = res.pos;
      const $pos = view.state.doc.resolve(pos);
      const node = $pos.nodeAfter || $pos.nodeBefore;
      if (!node) return;
      if (node.type.name === 'nexusEmbed' || node.type.name === 'nexusTable' || node.type.name === 'nexusTest') {
        try {
          const raw = String((node.attrs as any)?.raw || '');
          const parsed = JSON.parse(raw);
          const embedId = String(parsed?.id || '').trim() || String((node.attrs as any)?.id || '').trim();
          openTargetKey({ targetKey: buildNoteEmbedCommentTargetKey(embedId), targetLabel: `Embed · ${node.type.name}` });
        } catch {
          openTargetKey({ targetKey: buildNoteEmbedCommentTargetKey('unknown'), targetLabel: `Embed · ${node.type.name}` });
        }
      }
      if (node.type.name === 'heading') {
        const text = node.textContent || 'Heading';
        const slug = slugifyHeading(text);
        // Occurrence is best-effort: count prior headings with same slug.
        let occ = 1;
        view.state.doc.descendants((n: any, p: number) => {
          if (p >= pos) return false;
          if (n.type.name !== 'heading') return true;
          const t = n.textContent || '';
          const s = slugifyHeading(t);
          if (s === slug) occ += 1;
          return true;
        });
        openTargetKey({ targetKey: buildNoteHeadingCommentTargetKey({ slug, occurrence: occ }), targetLabel: text });
      }
    };
    dom.addEventListener('mousedown', onMouseDown);
    return () => dom.removeEventListener('mousedown', onMouseDown);
  }, [editor, activeTool, openTargetKey, editorViewReadyTick]);

  // Allow embed headers (node views) to request opening a comment target.
  useEffect(() => {
    return listenNoteOpenCommentTarget((detail) => {
      openTargetKey({ targetKey: detail.targetKey, targetLabel: detail.targetLabel });
    });
  }, [openTargetKey]);

  // When a thread is selected from the comments panel, scroll to it in the note.
  useEffect(() => {
    if (!editor) return;
    if (editorViewReadyTick <= 0) return;
    const key = String(commentPanel.targetKey || '').trim();
    if (!key) return;

    // Headings: find by computed key (slug+occurrence) from the current document.
    const hIdx = headings.findIndex((h) => h.targetKey === key);
    if (hIdx >= 0) {
      clickHeading(headings[hIdx]!.pos, hIdx);
      return;
    }

    // Range marks: `note:r:<id>` where DOM is <span data-note-comment="id">…</span>
    if (key.startsWith('note:r:')) {
      const id = key.slice('note:r:'.length);
      try {
        const root = editor.view.dom as HTMLElement;
        const el = root.querySelector(`span[data-note-comment="${safeCssEscape(id)}"]`) as HTMLElement | null;
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } catch {
        // ignore
      }
      return;
    }

    // Embeds: `note:embed:<id>`; node views stamp `data-note-embed-id`.
    if (key.startsWith('note:embed:')) {
      const id = key.slice('note:embed:'.length);
      try {
        const root = editor.view.dom as HTMLElement;
        const el = root.querySelector(`[data-note-embed-id="${safeCssEscape(id)}"]`) as HTMLElement | null;
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } catch {
        // ignore
      }
    }
  }, [commentPanel.targetKey, editor, editorViewReadyTick, headings]);

  return (
    <main className="mac-desktop flex h-screen flex-col">
      <EditorMenubar
        status={statusLabel}
        activeFileName={title}
        onWorkspace={onBack}
        rightContent={
          <>
            <button
              type="button"
              className={`mac-btn ${activeTool === 'comment' ? 'mac-btn--primary' : ''}`}
              onClick={() => {
                setActiveTool((t) => (t === 'comment' ? 'select' : 'comment'));
                if (activeTool === 'comment') onCommentPanelChange({ targetKey: null });
              }}
              title="Toggle comment tool"
            >
              <MessageSquare size={16} />
            </button>
            {activeTool === 'comment' ? (
              <button type="button" className="mac-btn" onClick={addRangeComment} title="Comment the selected text">
                Add comment
              </button>
            ) : null}
          </>
        }
      />

      <div className="flex-1 overflow-hidden flex">
        {/* Left outline */}
        <aside className="w-[260px] shrink-0 border-r border-slate-200 bg-white/70">
          <div className="h-full flex flex-col">
            <div className="px-3 py-2 text-[11px] uppercase tracking-wide text-slate-500 border-b bg-slate-50">
              Outline
            </div>
            <div className="flex-1 overflow-auto px-2 py-2">
              {headings.length === 0 ? (
                <div className="px-2 py-2 text-xs text-slate-500">Add headings (`#`, `##`, …) to build navigation.</div>
              ) : (
                <div className="space-y-1">
                  {headings.map((h, idx) => {
                    const isActive = idx === activeHeadingIdx;
                    const pad = Math.max(0, Math.min(20, (h.level - 1) * 10));
                    const hasComment = !!allThreads[h.targetKey];
                    return (
                      <div
                        key={h.pos}
                        className={`w-full rounded px-2 py-1 text-[12px] flex items-center gap-2 ${
                          isActive ? 'bg-blue-50 text-blue-800' : 'hover:bg-slate-50 text-slate-700'
                        }`}
                        style={{ paddingLeft: 8 + pad }}
                        title={h.text}
                      >
                        <button
                          type="button"
                          className="flex-1 min-w-0 truncate text-left"
                          onClick={() => clickHeading(h.pos, idx)}
                        >
                          {h.text}
                        </button>
                        {hasComment ? (
                          <button
                            type="button"
                            className="shrink-0 opacity-70 hover:opacity-100"
                            title="Open comments"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                            }}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              openTargetKey({ targetKey: h.targetKey, targetLabel: h.text });
                              clickHeading(h.pos, idx);
                            }}
                          >
                            <MessageSquare size={12} />
                          </button>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </aside>

        {/* Main doc */}
        <div className="flex-1 overflow-hidden flex">
          <div className="flex-1 overflow-auto" ref={scrollRef}>
            <div className="max-w-[920px] mx-auto px-8 py-10">
              <div className="relative">
                <div ref={editorWrapRef}>
                  {editor ? <EditorContent editor={editor} /> : <div className="text-xs opacity-70">Loading editor…</div>}
                </div>

                {/* Notion-style drag handle: follows hovered block and supports drag reorder. */}
                {editor && dragHandle.open && typeof dragHandle.pos === 'number' ? (
                  <button
                    type="button"
                    data-note-drag-handle="1"
                    className="absolute z-[50] mac-btn h-7 w-7 flex items-center justify-center opacity-70 hover:opacity-100 select-none"
                    style={{ top: dragHandle.top, left: dragHandle.left }}
                    title="Drag to move block"
                    draggable
                    onMouseDown={onHandleMouseDown}
                    onDragStart={onHandleDragStart}
                    onDragEnd={onHandleDragEnd}
                  >
                    ⋮⋮
                  </button>
                ) : null}
              </div>
            </div>
          </div>

          {/* Right panel: comments */}
          {activeTool === 'comment' ? (
            <aside className="w-[380px] shrink-0 border-l border-slate-200 bg-white/70">
              <CommentsPanel
                doc={yDoc}
                selectedTargetKey={commentPanel.targetKey}
                selectedTargetLabel={commentPanel.targetLabel}
                scrollToThreadId={commentPanel.scrollToThreadId || null}
                onClose={() => {
                  onCommentPanelChange({ targetKey: null });
                  setActiveTool('select');
                }}
                onActiveTargetKeyChange={(next) => onCommentPanelChange({ targetKey: next })}
              />
            </aside>
          ) : null}
        </div>
      </div>

      {/* Slash menu (MVP) */}
      <SlashMenu
        open={slash.menu.open}
        x={slash.menu.x}
        y={slash.menu.y}
        items={slashItems}
        index={slash.index}
        debugText={slash.debugText}
        errorText={slash.errorText}
        onPick={pickSlashItem}
        onHoverIndex={slash.setIndex}
        onClose={slash.close}
      />
    </main>
  );
}

