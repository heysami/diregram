'use client';

import type { Editor } from '@tiptap/react';
import type { SlashItem } from '@/components/note/slash/SlashMenu';
import { useSlashMenuController, type SlashMenuState } from '@/components/note/slash/useSlashMenuController';

export type { SlashMenuState };

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
  return useSlashMenuController(opts);
}

