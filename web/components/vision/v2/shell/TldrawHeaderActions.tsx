'use client';

import { Copy, Redo2, Trash2, Undo2 } from 'lucide-react';
import type { Editor } from 'tldraw';

export function TldrawHeaderActions({ editor }: { editor: Editor | null }) {
  const disabled = !editor;
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        className="mac-btn mac-btn--icon disabled:opacity-40 disabled:cursor-not-allowed"
        onClick={() => {
          try {
            editor?.undo();
          } catch {
            // ignore
          }
        }}
        title="Undo"
        disabled={disabled}
      >
        <Undo2 size={16} />
      </button>
      <button
        type="button"
        className="mac-btn mac-btn--icon disabled:opacity-40 disabled:cursor-not-allowed"
        onClick={() => {
          try {
            editor?.redo();
          } catch {
            // ignore
          }
        }}
        title="Redo"
        disabled={disabled}
      >
        <Redo2 size={16} />
      </button>
      <button
        type="button"
        className="mac-btn mac-btn--icon disabled:opacity-40 disabled:cursor-not-allowed"
        onClick={() => {
          const ed = editor;
          if (!ed) return;
          try {
            const ids = ed.getSelectedShapeIds();
            if (!ids || ids.length === 0) return;
            ed.deleteShapes(ids as any);
          } catch {
            // ignore
          }
        }}
        title="Delete selection"
        disabled={disabled}
      >
        <Trash2 size={16} />
      </button>
      <button
        type="button"
        className="mac-btn mac-btn--icon disabled:opacity-40 disabled:cursor-not-allowed"
        onClick={() => {
          const ed = editor;
          if (!ed) return;
          try {
            const ids = ed.getSelectedShapeIds();
            if (!ids || ids.length === 0) return;
            ed.duplicateShapes(ids as any, { x: 16, y: 16 } as any);
          } catch {
            // ignore
          }
        }}
        title="Duplicate selection"
        disabled={disabled}
      >
        <Copy size={16} />
      </button>
    </div>
  );
}
