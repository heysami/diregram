'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Editor } from '@tiptap/react';
import type { SlashItem } from '@/components/note/slash/SlashMenu';

export type SlashMenuState = { open: boolean; x: number; y: number; pos: number };

export function useNoteSlashMenu(opts: {
  editor: Editor | null;
  items: SlashItem[];
  onRunCommand: (cmd: string, ctx: {
    slashPos: number;
    close: () => void;
    setErrorText: (s: string | null) => void;
    setDebugText: (s: string | null) => void;
  }) => void;
}) {
  const { editor, items, onRunCommand } = opts;

  const [menu, setMenu] = useState<SlashMenuState>({ open: false, x: 0, y: 0, pos: 0 });
  const [index, setIndex] = useState(0);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [debugText, setDebugText] = useState<string | null>(null);

  const close = () => setMenu((s) => (s.open ? { ...s, open: false } : s));

  // Open from the ProseMirror slash extension event.
  useEffect(() => {
    const onSlash = (evt: Event) => {
      const e = evt as CustomEvent<{ x: number; y: number; pos: number }>;
      const d = e.detail;
      if (!d) return;
      // The slash keydown fires before ProseMirror inserts the "/" character.
      // Store the position AFTER the slash is inserted so we can reliably delete it later.
      setMenu({ open: true, x: d.x, y: d.y, pos: d.pos + 1 });
      setIndex(0);
      setErrorText(null);
      setDebugText(null);
    };
    window.addEventListener('note:slash', onSlash as EventListener);
    return () => window.removeEventListener('note:slash', onSlash as EventListener);
  }, []);

  const itemCount = items.length;

  // Keyboard navigation when open.
  useEffect(() => {
    if (!menu.open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (!menu.open) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setIndex((i) => (i + 1) % Math.max(1, itemCount));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setIndex((i) => (i - 1 + itemCount) % Math.max(1, itemCount));
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        const it = items[index];
        if (it) onRunCommand(it.id, { slashPos: menu.pos, close, setErrorText, setDebugText });
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [menu.open, menu.pos, index, itemCount, items, onRunCommand]);

  // Auto-close when cursor moves to a different block/line.
  useEffect(() => {
    if (!editor) return;
    if (!menu.open) return;

    let openBlockStart: number | null = null;
    try {
      const $p = editor.state.doc.resolve(Math.max(0, Number(menu.pos) || editor.state.selection.from));
      openBlockStart = $p.depth >= 1 ? $p.before(1) : null;
    } catch {
      openBlockStart = null;
    }

    const onSel = () => {
      if (!editor) return;
      if (!menu.open) return;
      try {
        const $from = (editor.state.selection as any).$from;
        const curBlockStart = $from?.depth >= 1 && typeof $from.before === 'function' ? $from.before(1) : null;
        if (openBlockStart != null && curBlockStart != null && curBlockStart !== openBlockStart) close();
      } catch {
        // ignore
      }
    };

    editor.on('selectionUpdate', onSel);
    return () => {
      editor.off('selectionUpdate', onSel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, menu.open, menu.pos]);

  const selectedItemId = useMemo(() => items[index]?.id || null, [items, index]);

  return {
    menu,
    index,
    setIndex,
    selectedItemId,
    errorText,
    setErrorText,
    debugText,
    setDebugText,
    close,
    openAt: (next: SlashMenuState) => setMenu(next),
  };
}

