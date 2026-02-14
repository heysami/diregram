'use client';

import { useEffect, useRef, useState } from 'react';
import { Node, mergeAttributes } from '@tiptap/core';
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';

function TabsView({
  editor,
  node,
  getPos,
  updateAttributes,
}: {
  editor: any;
  node: any;
  getPos: (() => number) | undefined;
  updateAttributes: (attrs: Record<string, unknown>) => void;
}) {
  const tabs: Array<{ tabId: string; title: string; pos: number }> = [];
  const basePos = typeof getPos === 'function' ? getPos() : null;
  const base = typeof basePos === 'number' ? basePos : null;
  const activeId = String((node.attrs as any)?.activeId || 'tab-1');

  // Compute child positions for updates (set title, etc.)
  if (typeof base === 'number') {
    let offset = 0;
    for (let i = 0; i < node.childCount; i += 1) {
      const child = node.child(i);
      const childPos = base + 1 + offset;
      offset += child.nodeSize;
      if (child.type.name !== 'nexusTab') continue;
      tabs.push({
        tabId: String((child.attrs as any)?.tabId || '').trim() || `tab-${i + 1}`,
        title: String((child.attrs as any)?.title || `Tab ${i + 1}`),
        pos: childPos,
      });
    }
  }

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Normalize duplicate/missing tab ids (React keys + active tab depend on uniqueness).
  useEffect(() => {
    if (!editor) return;
    if (typeof base !== 'number') return;
    if (!tabs.length) return;

    const seen = new Map<string, number>();
    const dupes: Array<{ pos: number; nextId: string }> = [];
    for (const t of tabs) {
      const id = String(t.tabId || '').trim() || 'tab';
      const n = (seen.get(id) || 0) + 1;
      seen.set(id, n);
      if (n > 1) {
        dupes.push({ pos: t.pos, nextId: `tab-${crypto.randomUUID()}` });
      }
    }
    if (dupes.length === 0) return;

    try {
      const tr = editor.state.tr;
      for (const d of dupes) {
        const n = tr.doc.nodeAt(d.pos);
        if (!n) continue;
        tr.setNodeMarkup(d.pos, undefined, { ...(n.attrs as any), tabId: d.nextId });
      }
      editor.view.dispatch(tr);
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, node?.childCount, base]);

  useEffect(() => {
    if (!editingId) return;
    const t = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [editingId]);

  const setActiveId = (id: string) => {
    try {
      updateAttributes({ activeId: id });
    } catch {
      // ignore
    }
  };

  const setTabTitle = (tabPos: number, title: string) => {
    try {
      const tr = editor.state.tr;
      const n = tr.doc.nodeAt(tabPos);
      if (!n) return;
      tr.setNodeMarkup(tabPos, undefined, { ...(n.attrs as any), title });
      editor.view.dispatch(tr);
    } catch {
      // ignore
    }
  };

  const beginEdit = (tabId: string, curTitle: string) => {
    setEditingId(tabId);
    setDraft(curTitle);
  };

  const commitEdit = () => {
    const id = editingId;
    if (!id) return;
    const rec = tabs.find((t) => t.tabId === id) || null;
    if (rec) setTabTitle(rec.pos, draft);
    setEditingId(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraft('');
  };

  const addTab = () => {
    try {
      const id = `tab-${crypto.randomUUID()}`;
      const insertPos = typeof base === 'number' ? base + node.nodeSize - 1 : editor.state.selection.to;
      editor.commands.insertContentAt(insertPos, {
        type: 'nexusTab',
        attrs: { tabId: id, title: `Tab ${Math.max(1, tabs.length + 1)}` },
        content: [{ type: 'paragraph' }],
      });
      setActiveId(id);
    } catch {
      // ignore
    }
  };

  return (
    <NodeViewWrapper as="div" className="my-3" data-nexus-tabs="1" data-active-tab={activeId}>
      <div className="flex items-center gap-3" contentEditable={false}>
        {tabs.map((t) => {
          const isActive = t.tabId === activeId;
          const isEditing = editingId === t.tabId;
          if (isEditing) {
            return (
              <input
                key={`${t.tabId || 'tab'}:${t.pos}`}
                ref={inputRef}
                className="h-7 w-[140px] bg-transparent text-sm font-medium text-slate-900 outline-none border-b border-slate-300 focus:border-slate-700"
                value={draft}
                onMouseDown={(e) => {
                  e.stopPropagation();
                }}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commitEdit}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    commitEdit();
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    cancelEdit();
                  }
                }}
              />
            );
          }

          return (
            <button
              key={`${t.tabId || 'tab'}:${t.pos}`}
              type="button"
              className={`h-7 text-sm font-medium ${
                isActive ? 'text-slate-900 border-b-2 border-slate-900' : 'text-slate-600 hover:text-slate-900 border-b-2 border-transparent'
              }`}
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onClick={() => setActiveId(t.tabId)}
              onDoubleClick={() => beginEdit(t.tabId, t.title)}
              title="Click to switch · Double-click to rename"
            >
              {t.title}
            </button>
          );
        })}
        <div className="flex-1" />
        <button
          type="button"
          className="h-7 px-2 text-slate-500 hover:text-slate-900"
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onClick={addTab}
          title="Add tab"
        >
          +
        </button>
      </div>

      <div className="py-3">
        <NodeViewContent className="[&_[data-nexus-tab]]:m-0" />
      </div>

      {/* End divider: makes it obvious where the tabs block ends */}
      <div className="border-b border-slate-200" contentEditable={false} />

      {/* Hide non-active tabs while keeping their content in the document */}
      <style>
        {`[data-nexus-tabs][data-active-tab="${String(activeId).replace(/"/g, '\\"')}"] [data-nexus-tab]:not([data-tab-id="${String(activeId).replace(/"/g, '\\"')}"]) { display: none; }`}
      </style>
    </NodeViewWrapper>
  );
}

export const NexusTabsNode = Node.create({
  name: 'nexusTabs',
  group: 'block',
  content: 'nexusTab+',
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      activeId: { default: 'tab-1' },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-nexus-tabs]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-nexus-tabs': '1' }), 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer((props) => <TabsView {...(props as any)} />);
  },
});

export const NexusTabNode = Node.create({
  name: 'nexusTab',
  content: 'block*',
  defining: true,

  addAttributes() {
    return {
      // Must be unique per tab; leave blank unless explicitly set.
      tabId: { default: '' },
      title: { default: 'Tab' },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-nexus-tab]' }];
  },

  renderHTML({ HTMLAttributes }) {
    const tabId = String((HTMLAttributes as any)?.tabId || '');
    return [
      'div',
      mergeAttributes(HTMLAttributes, { 'data-nexus-tab': '1', 'data-tab-id': tabId || 'tab-1' }),
      0,
    ];
  },
});

