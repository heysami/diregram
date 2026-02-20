'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import type { SlashItem } from '@/components/note/slash/SlashMenu';
import { NOTE_SLASH_EVENT, SLASH_MENU_ROOT_SELECTOR } from '@/components/note/slash/constants';
import type { SlashMenuOpenDetail } from '@/components/note/slash/types';
import { filterSlashItems } from '@/components/note/slash/filterSlashItems';

export type SlashMenuState = { open: boolean; x: number; y: number; pos: number };

export function useSlashMenuController(opts: {
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

  const editorRef = useRef<Editor | null>(editor);
  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  const [menu, setMenu] = useState<SlashMenuState>({ open: false, x: 0, y: 0, pos: 0 });
  const [index, setIndex] = useState(-1); // -1 => none selected yet
  const [query, setQuery] = useState('');
  const [errorText, setErrorText] = useState<string | null>(null);
  const [debugText, setDebugText] = useState<string | null>(null);

  const openRef = useRef(false);
  const menuRef = useRef(menu);
  const queryRef = useRef(query);
  const indexRef = useRef(index);
  const itemsRef = useRef(items);

  useEffect(() => {
    openRef.current = menu.open;
    menuRef.current = menu;
  }, [menu]);
  useEffect(() => {
    queryRef.current = query;
  }, [query]);
  useEffect(() => {
    indexRef.current = index;
  }, [index]);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const close = useCallback(() => {
    setMenu((s) => (s.open ? { ...s, open: false } : s));
    setIndex(-1);
    setQuery('');
    setErrorText(null);
    setDebugText(null);
  }, []);

  const visibleItems = useMemo(() => filterSlashItems(items, query), [items, query]);

  // Open from ProseMirror event.
  useEffect(() => {
    const onSlash = (evt: Event) => {
      const e = evt as CustomEvent<SlashMenuOpenDetail>;
      const d = e.detail;
      if (!d) return;
      // Keydown fires before ProseMirror inserts "/".
      // Store position AFTER insertion so deletion is consistent when command chosen.
      setMenu({ open: true, x: d.x, y: d.y, pos: d.pos + 1 });
      setIndex(-1);
      setQuery('');
      setErrorText(null);
      setDebugText(null);
    };
    window.addEventListener(NOTE_SLASH_EVENT, onSlash as EventListener);
    return () => window.removeEventListener(NOTE_SLASH_EVENT, onSlash as EventListener);
  }, []);

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
      try {
        if (!openRef.current) return;
        const ed = editorRef.current;
        if (!ed) return;
        const $from = (ed.state.selection as any).$from;
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

  // Global outside-click close.
  useEffect(() => {
    const onPointerDownCapture = (e: PointerEvent) => {
      if (!openRef.current) return;
      const t = e.target as Element | null;
      if (t && typeof t.closest === 'function') {
        if (t.closest(SLASH_MENU_ROOT_SELECTOR)) return;
      }
      close();
    };
    window.addEventListener('pointerdown', onPointerDownCapture, true);
    return () => window.removeEventListener('pointerdown', onPointerDownCapture, true);
  }, [close]);

  // Global keyboard controller (single source of truth, no focus dependence).
  useEffect(() => {
    const onKeyDownCapture = (e: KeyboardEvent) => {
      if (!openRef.current) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const curMenu = menuRef.current;
      const curQuery = queryRef.current;
      const curIndex = indexRef.current;
      const curItems = filterSlashItems(itemsRef.current, curQuery);
      const count = curItems.length;

      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        close();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        e.stopPropagation();
        if (count <= 0) return;
        setIndex((i) => (i < 0 ? 0 : (i + 1) % count));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopPropagation();
        if (count <= 0) return;
        setIndex((i) => (i < 0 ? 0 : (i - 1 + count) % count));
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        const pickIndex = count <= 0 ? -1 : curIndex < 0 ? 0 : Math.min(curIndex, count - 1);
        const it = pickIndex >= 0 ? curItems[pickIndex] : null;
        if (it) onRunCommand(it.id, { slashPos: curMenu.pos, close, setErrorText, setDebugText });
        return;
      }
      if (e.key === 'Backspace') {
        e.preventDefault();
        e.stopPropagation();
        if (curQuery.length > 0) {
          const nextQuery = curQuery.slice(0, -1);
          setQuery(nextQuery);
          setIndex(-1);
          return;
        }
        // Empty query: delete "/" trigger (best-effort) and close.
        try {
          editorRef.current?.commands.deleteRange({ from: Math.max(0, curMenu.pos - 1), to: Math.max(0, curMenu.pos) });
        } catch {
          // ignore
        }
        close();
        return;
      }

      // Query typing. Never include "/" in query.
      if (e.key === '/' || e.key.length !== 1) return;
      e.preventDefault();
      e.stopPropagation();
      setQuery((prev) => `${prev}${e.key}`);
      setIndex(-1);
    };

    window.addEventListener('keydown', onKeyDownCapture, true);
    return () => window.removeEventListener('keydown', onKeyDownCapture, true);
  }, [close, onRunCommand]);

  const selectedItemId = useMemo(() => (index >= 0 ? visibleItems[index]?.id || null : null), [visibleItems, index]);

  return {
    menu,
    index,
    setIndex,
    query,
    visibleItems,
    selectedItemId,
    errorText,
    setErrorText,
    debugText,
    setDebugText,
    close,
    openAt: (next: SlashMenuState) => setMenu(next),
  };
}

