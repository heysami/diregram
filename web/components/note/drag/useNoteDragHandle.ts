'use client';

import { useEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { NodeSelection } from '@tiptap/pm/state';
import { selectNearestBlockAtCoords } from '@/components/note/tiptap/dragHandlePlugin';

export type DragHandleState = {
  open: boolean;
  top: number;
  left: number;
  pos: number | null;
  height: number;
};

export function useNoteDragHandle(opts: {
  editor: Editor | null;
  editorViewReadyTick: number;
  editorWrapRef: React.RefObject<HTMLDivElement | null>;
  scrollRef: React.RefObject<HTMLDivElement | null>;
}) {
  const { editor, editorViewReadyTick, editorWrapRef, scrollRef } = opts;

  const [selectedBlockPos, setSelectedBlockPos] = useState<number | null>(null);
  const [dragHandle, setDragHandle] = useState<DragHandleState>({
    open: false,
    top: 0,
    left: 0,
    pos: null,
    height: 0,
  });

  const dragHandleRef = useRef(dragHandle);
  const dragImageElRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    dragHandleRef.current = dragHandle;
  }, [dragHandle]);

  // Notion-style left drag handle that follows the hovered block.
  useEffect(() => {
    if (!editor) return;
    if (editorViewReadyTick <= 0) return;

    let view: any = null;
    let pmDom: HTMLElement | null = null;
    try {
      view = (editor as any).view || null;
      pmDom = (view?.dom as HTMLElement | undefined) || null;
    } catch {
      view = null;
      pmDom = null;
    }
    if (!view || !pmDom) return;

    const getWrapRect = () => {
      const wrap = editorWrapRef.current;
      return (wrap || pmDom).getBoundingClientRect();
    };

    const pointInRect = (x: number, y: number, r: DOMRect): boolean => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;

    const isOverHandleRect = (x: number, y: number): boolean => {
      const el = document.querySelector('[data-note-drag-handle]') as HTMLElement | null;
      if (!el) return false;
      const r = el.getBoundingClientRect();
      return pointInRect(x, y, r);
    };

    const updateAtPoint = (clientX: number, clientY: number) => {
      try {
        const res = view.posAtCoords({ left: clientX, top: clientY });
        if (!res) {
          setDragHandle((h) => (h.open ? { ...h, open: false, pos: null } : h));
          return;
        }
        const $pos = view.state.doc.resolve(res.pos);
        if ($pos.depth < 1) {
          setDragHandle((h) => (h.open ? { ...h, open: false, pos: null } : h));
          return;
        }
        const blockPos = $pos.before(1);
        // `nodeDOM` wants the position at the start of the node.
        let nodeDom = view.nodeDOM(blockPos) as HTMLElement | null;
        // Sometimes nodeDOM returns a text node; walk up to an element.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        while (nodeDom && (nodeDom as any).nodeType && (nodeDom as any).nodeType !== 1) nodeDom = nodeDom.parentElement;
        if (!nodeDom || !pmDom.contains(nodeDom)) {
          setDragHandle((h) => (h.open ? { ...h, open: false, pos: null } : h));
          return;
        }

        const r = nodeDom.getBoundingClientRect();
        const wrapR = getWrapRect();
        // Position handle slightly down from the top to align with first line.
        const top = r.top - wrapR.top + 4;
        const left = r.left - wrapR.left - 34;
        const height = Math.max(18, Math.min(64, r.height));
        setDragHandle({ open: true, top, left, pos: blockPos, height });
      } catch {
        setDragHandle((h) => (h.open ? { ...h, open: false, pos: null } : h));
      }
    };

    const onScroll = () => {
      // Keep handle aligned while scrolling if it's currently open.
      const cur = dragHandleRef.current;
      if (!cur.open || cur.pos == null) return;
      try {
        const nodeDom = view.nodeDOM(cur.pos) as HTMLElement | null;
        if (!nodeDom) return;
        const r = nodeDom.getBoundingClientRect();
        const wrapR = getWrapRect();
        setDragHandle((h) => ({ ...h, top: r.top - wrapR.top + 4, left: r.left - wrapR.left - 34 }));
      } catch {
        // ignore
      }
    };

    // Global tracking: the handle is positioned to the left (often outside the editor wrapper box),
    // so element-scoped mouseleave/mousemove can incorrectly hide it.
    const onWindowMouseMove = (e: MouseEvent) => {
      const x = e.clientX;
      const y = e.clientY;

      // If the pointer is over the handle itself, keep it visible.
      if (isOverHandleRect(x, y)) return;

      // Only update while inside the editor area (with a left gutter to include the handle zone).
      const wrapR = getWrapRect();
      const gutterLeft = 64;
      const inside = x >= wrapR.left - gutterLeft && x <= wrapR.right + 4 && y >= wrapR.top - 4 && y <= wrapR.bottom + 4;

      if (!inside) {
        setDragHandle((h) => (h.open ? { ...h, open: false, pos: null } : h));
        return;
      }

      // When moving into the left gutter (between content and handle), ProseMirror often can't
      // resolve a document position. Keep the current handle so you can reach/click it.
      try {
        const pmR = pmDom.getBoundingClientRect();
        if (x < pmR.left && dragHandleRef.current.open) return;
      } catch {
        // ignore
      }

      updateAtPoint(x, y);
    };

    window.addEventListener('mousemove', onWindowMouseMove, { passive: true });
    scrollRef.current?.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('mousemove', onWindowMouseMove as any);
      scrollRef.current?.removeEventListener('scroll', onScroll as any);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, editorViewReadyTick]);

  const onHandleMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!editor) return;
    try {
      const pos =
        dragHandle.pos ?? selectNearestBlockAtCoords(editor, { left: (e as any).clientX, top: (e as any).clientY });
      if (typeof pos !== 'number') return;
      const { state, view } = editor;
      const sel = NodeSelection.create(state.doc, pos);
      view.dispatch(state.tr.setSelection(sel));
      editor.commands.focus();
      setSelectedBlockPos(sel.from);
    } catch {
      // ignore
    }
  };

  const onHandleDragStart = (e: React.DragEvent) => {
    e.stopPropagation();
    if (!editor) return;
    try {
      const pos =
        dragHandle.pos ??
        selectedBlockPos ??
        selectNearestBlockAtCoords(editor, { left: e.clientX, top: e.clientY });
      if (typeof pos !== 'number') return;
      const { state, view } = editor;
      const sel = NodeSelection.create(state.doc, pos);
      view.dispatch(state.tr.setSelection(sel));
      // Tell ProseMirror we're dragging this node.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (view as any).dragging = { slice: sel.content(), move: true };
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', ' ');
        // Avoid the big "dragging an image" ghost preview.
        try {
          const el = document.createElement('div');
          el.style.width = '1px';
          el.style.height = '1px';
          el.style.opacity = '0';
          el.style.position = 'fixed';
          el.style.left = '-9999px';
          el.style.top = '-9999px';
          document.body.appendChild(el);
          dragImageElRef.current = el;
          e.dataTransfer.setDragImage(el, 0, 0);
        } catch {
          // ignore
        }
      }
    } catch {
      // ignore
    }
  };

  const onHandleDragEnd = (e: React.DragEvent) => {
    e.stopPropagation();
    try {
      const view = (editor as any)?.view;
      if (view && (view as any).dragging) (view as any).dragging = null;
      const el = dragImageElRef.current;
      if (el && el.parentElement) el.parentElement.removeChild(el);
      dragImageElRef.current = null;
    } catch {
      // ignore
    }
  };

  return {
    dragHandle,
    onHandleMouseDown,
    onHandleDragStart,
    onHandleDragEnd,
  };
}

