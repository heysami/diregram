'use client';

import { Node, mergeAttributes } from '@tiptap/core';
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';
import { useReactNodeView } from '@tiptap/react';

function ColumnsView() {
  const { nodeViewContentRef } = useReactNodeView();
  return (
    <NodeViewWrapper as="div" className="my-3" data-nexus-columns="1">
      {/* 
        Structural override: avoid `NodeViewContent` entirely.
        `NodeViewContent` always injects `data-node-view-content`, and many editor styles
        target that attribute and force block flow. We mount the ProseMirror contentDOM on
        our own element instead, so columns can lay out correctly.
      */}
      <div
        ref={nodeViewContentRef as any}
        data-nexus-columns-content="1"
        style={{
          display: 'flex',
          flexDirection: 'row',
          flexWrap: 'nowrap',
          gap: 16,
          alignItems: 'stretch',
          width: '100%',
        }}
      />
      <div className="mt-2 border-b border-slate-200" contentEditable={false} />
    </NodeViewWrapper>
  );
}

export const NexusColumnsNode = Node.create({
  name: 'nexusColumns',
  group: 'block',
  content: 'nexusColumn+',
  selectable: true,
  draggable: true,

  parseHTML() {
    return [{ tag: 'div[data-nexus-columns]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-nexus-columns': '1' }), 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer(() => <ColumnsView />);
  },
});

export const NexusColumnNode = Node.create({
  name: 'nexusColumn',
  content: 'block*',
  defining: true,
  selectable: false,

  parseHTML() {
    return [{ tag: 'div[data-nexus-column]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-nexus-column': '1' }), 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer(() => {
      return (
        <NodeViewWrapper
          as="div"
          className="min-w-0 rounded border border-slate-200 bg-white/60 px-3 py-2"
          data-nexus-column="1"
          style={{ flex: '1 1 0', minWidth: 0 }}
        >
          <NodeViewContent className="min-w-0 [&>p:first-child]:mt-0 [&>p:last-child]:mb-0" />
        </NodeViewWrapper>
      );
    });
  },
});

