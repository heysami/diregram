'use client';

import { Node, mergeAttributes } from '@tiptap/core';
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';

export const NexusBoxNode = Node.create({
  name: 'nexusBox',
  group: 'block',
  content: 'block*',
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      title: {
        default: '',
      },
    };
  },

  parseHTML() {
    return [{ tag: 'section[data-nexus-box]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['section', mergeAttributes(HTMLAttributes, { 'data-nexus-box': '1' }), 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer(({ node }) => {
      const title = String((node.attrs as any)?.title || '');
      return (
        <NodeViewWrapper
          as="section"
          className="my-3 rounded border border-slate-200 bg-white/70 px-4 py-3"
          data-nexus-box="1"
        >
          {title.trim().length ? <div className="mb-2 text-xs font-semibold text-slate-600">{title}</div> : null}
          <NodeViewContent className="[&>p:first-child]:mt-0 [&>p:last-child]:mb-0" />
        </NodeViewWrapper>
      );
    });
  },
});

