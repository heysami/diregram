'use client';

import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { NOTE_SLASH_EVENT } from '@/components/note/slash/constants';

export const SlashMenuExtension = Extension.create({
  name: 'slashMenu',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('slashMenu'),
        props: {
          handleKeyDown(view, event) {
            if (event.key !== '/') return false;
            if (event.metaKey || event.ctrlKey || event.altKey) return false;
            try {
              const sel = view.state.selection;
              const pos = sel.from;
              const coords = view.coordsAtPos(pos);
              window.dispatchEvent(
                new CustomEvent(NOTE_SLASH_EVENT, {
                  detail: { x: coords.left, y: coords.bottom, pos },
                }),
              );
            } catch {
              // ignore
            }
            // Let the slash be inserted; we'll delete it when a command is chosen.
            return false;
          },
        },
      }),
    ];
  },
});

