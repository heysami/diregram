'use client';

import { useEffect, useRef, useState } from 'react';
import { Node, mergeAttributes } from '@tiptap/core';
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';

function ToggleView({
  node,
  updateAttributes,
}: {
  node: any;
  updateAttributes: (attrs: Record<string, unknown>) => void;
}) {
  const title = String((node.attrs as any)?.title || 'Toggle');
  const open = Boolean((node.attrs as any)?.open);

  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [draft, setDraft] = useState(title);

  // Keep draft in sync when not actively editing.
  useEffect(() => {
    if (!editing) setDraft(title);
  }, [title, editing]);

  useEffect(() => {
    if (!editing) return;
    const t = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [editing]);

  const commit = () => {
    try {
      updateAttributes({ title: draft });
    } catch {
      // ignore
    }
    setEditing(false);
  };

  return (
    <NodeViewWrapper as="div" className="my-3" data-nexus-toggle="1">
      <div className="flex items-center gap-2 select-none" contentEditable={false}>
        <button
          type="button"
          className="h-7 w-7 flex items-center justify-center text-slate-600 hover:text-slate-900"
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onClick={() => updateAttributes({ open: !open })}
          title={open ? 'Collapse' : 'Expand'}
        >
          {open ? '▾' : '▸'}
        </button>

        {editing ? (
          <input
            ref={inputRef}
            className="h-7 w-full bg-transparent text-sm font-semibold text-slate-800 outline-none"
            value={draft}
            placeholder="Title…"
            onMouseDown={(e) => e.stopPropagation()}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commit();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                setDraft(title);
                setEditing(false);
              }
            }}
          />
        ) : (
          <button
            type="button"
            className="w-full text-left h-7 px-1 text-sm font-semibold text-slate-800 hover:bg-slate-50 rounded"
            onMouseDown={(e) => {
              // Prevent ProseMirror from hijacking selection.
              e.preventDefault();
              e.stopPropagation();
            }}
            onClick={() => {
              // Single click just focuses the editor; no-op here.
            }}
            onDoubleClick={() => setEditing(true)}
            title="Double-click to edit"
          >
            {title}
          </button>
        )}
      </div>

      <div className={open ? 'mt-2 pl-9' : 'hidden'}>
        <NodeViewContent className="[&>p:first-child]:mt-0 [&>p:last-child]:mb-0" />
      </div>
    </NodeViewWrapper>
  );
}

export const NexusToggleNode = Node.create({
  name: 'nexusToggle',
  group: 'block',
  content: 'block*',
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      title: {
        default: 'Toggle',
      },
      open: {
        default: true,
      },
    };
  },

  parseHTML() {
    return [{ tag: 'details[data-nexus-toggle]' }];
  },

  renderHTML({ HTMLAttributes }) {
    // Render as <details> so copy/paste keeps a sensible structure.
    // The NodeView controls actual behavior.
    return ['details', mergeAttributes(HTMLAttributes, { 'data-nexus-toggle': '1' }), 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer((props) => <ToggleView {...(props as any)} />);
  },
});

