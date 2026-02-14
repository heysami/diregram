'use client';

import { Mark, mergeAttributes } from '@tiptap/core';

export const CommentMark = Mark.create({
  name: 'comment',

  addAttributes() {
    return {
      id: {
        default: '',
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-note-comment]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-note-comment': String((HTMLAttributes as any)?.id || '1'),
        class: 'rounded bg-yellow-100 px-0.5',
      }),
      0,
    ];
  },
});

