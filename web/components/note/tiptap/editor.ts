'use client';

import type * as Y from 'yjs';
import type { HocuspocusProvider } from '@hocuspocus/provider';
import { useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Collaboration from '@tiptap/extension-collaboration';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Placeholder from '@tiptap/extension-placeholder';
import Dropcursor from '@tiptap/extension-dropcursor';
import Gapcursor from '@tiptap/extension-gapcursor';
import { SlashMenuExtension } from '@/components/note/tiptap/slashMenuExtension';
import { NexusEmbedNode } from '@/components/note/tiptap/nodes/NexusEmbedNode';
import { NexusTableNode } from '@/components/note/tiptap/nodes/NexusTableNode';
import { NexusTestNode } from '@/components/note/tiptap/nodes/NexusTestNode';
import { NexusBoxNode } from '@/components/note/tiptap/nodes/NexusBoxNode';
import { NexusToggleNode } from '@/components/note/tiptap/nodes/NexusToggleNode';
import { NexusColumnsNode, NexusColumnNode } from '@/components/note/tiptap/nodes/NexusColumnsNode';
import { NexusTabsNode, NexusTabNode } from '@/components/note/tiptap/nodes/NexusTabsNode';
import { CommentMark } from '@/components/note/tiptap/marks/commentMark';
import { NoteCommentIndicatorExtension } from '@/components/note/tiptap/commentIndicatorExtension';

export function useNoteEditor(opts: {
  yDoc: Y.Doc;
  provider: HocuspocusProvider | null;
  user: { id: string; name: string; color?: string };
}) {
  const { yDoc, provider, user } = opts;

  const extensions = [
    StarterKit,
    TaskList,
    TaskItem.configure({ nested: true }),
    Dropcursor,
    Gapcursor,
    SlashMenuExtension,
    NexusEmbedNode.configure({ yDoc }),
    NexusTableNode.configure({ yDoc }),
    NexusTestNode.configure({ yDoc }),
    NexusBoxNode,
    NexusToggleNode,
    NexusColumnsNode,
    NexusColumnNode,
    NexusTabsNode,
    NexusTabNode,
    CommentMark,
    NoteCommentIndicatorExtension.configure({ yDoc }),
    Placeholder.configure({
      placeholder: 'Type / for commands…',
    }),
    Collaboration.configure({
      document: yDoc,
      field: 'note',
    }),
  ];

  return useEditor(
    {
      // Next.js App Router can render client components during SSR passes.
      // TipTap requires this to avoid hydration mismatches.
      immediatelyRender: false,
      extensions,
      editorProps: {
        attributes: {
          // Tailwind preflight resets h1/h2/etc to inherit sizes.
          // We style the ProseMirror content explicitly to make transforms (heading/list/quote) obvious.
          class: [
            'min-h-[70vh] outline-none focus:outline-none',
            'max-w-none',
            // Typography-like spacing
            '[&_p]:my-2 [&_p]:leading-relaxed',
            '[&_h1]:mt-6 [&_h1]:mb-3 [&_h1]:text-3xl [&_h1]:font-bold [&_h1]:tracking-tight',
            '[&_h2]:mt-6 [&_h2]:mb-2 [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:tracking-tight',
            '[&_h3]:mt-5 [&_h3]:mb-2 [&_h3]:text-xl [&_h3]:font-semibold [&_h3]:tracking-tight',
            '[&_h4]:mt-4 [&_h4]:mb-2 [&_h4]:text-lg [&_h4]:font-semibold',
            '[&_h5]:mt-4 [&_h5]:mb-1 [&_h5]:text-base [&_h5]:font-semibold [&_h5]:opacity-90',
            '[&_h6]:mt-4 [&_h6]:mb-1 [&_h6]:text-sm [&_h6]:font-semibold [&_h6]:opacity-80',
            '[&_ul]:my-2 [&_ul]:pl-6 [&_ul]:list-disc',
            '[&_ol]:my-2 [&_ol]:pl-6 [&_ol]:list-decimal',
            '[&_li]:my-1',
            '[&_blockquote]:my-3 [&_blockquote]:border-l-4 [&_blockquote]:border-slate-200 [&_blockquote]:pl-3 [&_blockquote]:text-slate-700',
            '[&_pre]:my-3 [&_pre]:rounded [&_pre]:bg-slate-100 [&_pre]:p-2 [&_pre]:overflow-x-auto',
            '[&_code]:rounded [&_code]:bg-slate-100 [&_code]:px-1 [&_code]:py-[1px] [&_code]:font-mono [&_code]:text-[12px]',
            '[&_hr]:my-6 [&_hr]:border-slate-200',

            // Task list: TipTap renders as <ul data-type="taskList"> and <li data-type="taskItem">.
            // Override generic list styles so we don't get bullets + weird stacking.
            "[&_[data-type='taskList']]:pl-0 [&_[data-type='taskList']]:list-none",
            "[&_[data-type='taskItem']]:flex [&_[data-type='taskItem']]:items-start [&_[data-type='taskItem']]:gap-2",
            "[&_[data-type='taskItem']>label]:mt-[3px] [&_[data-type='taskItem']>label]:shrink-0",
            "[&_[data-type='taskItem']>div]:flex-1",
            "[&_[data-type='taskItem']_p]:my-0",

            // Nexus Columns layout is enforced inline in the node view to avoid
            // conflicts with global typography/layout CSS.
          ].join(' '),
        },
      },
    },
    // Recreate when the Yjs doc changes (provider/cursors are optional here).
    [yDoc, user.id, user.name, user.color],
  );
}

