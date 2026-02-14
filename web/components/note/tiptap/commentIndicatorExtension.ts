'use client';

import type * as Y from 'yjs';
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { getAllThreads, observeComments } from '@/lib/node-comments';

export const NOTE_COMMENT_INDICATOR_META = 'noteCommentIndicators:tick';

const pluginKey = new PluginKey<{ tick: number }>('noteCommentIndicators');

function makeIconButton(params: { targetKey: string; title: string }) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'note-comment-indicator';
  btn.setAttribute('contenteditable', 'false');
  btn.title = params.title;
  btn.style.display = 'inline-flex';
  btn.style.alignItems = 'center';
  btn.style.justifyContent = 'center';
  btn.style.width = '16px';
  btn.style.height = '16px';
  btn.style.marginLeft = '4px';
  btn.style.borderRadius = '6px';
  btn.style.border = '1px solid rgba(148, 163, 184, 0.6)'; // slate-400-ish
  btn.style.background = 'rgba(255,255,255,0.9)';
  btn.style.opacity = '0.75';
  btn.style.cursor = 'pointer';
  btn.style.padding = '0';
  btn.style.lineHeight = '1';
  btn.style.verticalAlign = 'middle';

  // Tiny inline SVG (message-square-ish).
  btn.innerHTML = `
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
      xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v8Z"
        stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `;

  const onDown = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };
  const onClick = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      window.dispatchEvent(new CustomEvent('note:openCommentTarget', { detail: { targetKey: params.targetKey } }));
    } catch {
      // ignore
    }
  };
  btn.addEventListener('mousedown', onDown);
  btn.addEventListener('click', onClick);
  btn.addEventListener('mouseenter', () => (btn.style.opacity = '1'));
  btn.addEventListener('mouseleave', () => (btn.style.opacity = '0.75'));
  return btn;
}

export const NoteCommentIndicatorExtension = Extension.create({
  name: 'noteCommentIndicators',

  addOptions() {
    return {
      yDoc: null as Y.Doc | null,
    };
  },

  addProseMirrorPlugins() {
    const yDoc = this.options.yDoc as Y.Doc | null;
    return [
      new Plugin<{ tick: number }>({
        key: pluginKey,
        state: {
          init: () => ({ tick: 0 }),
          apply: (tr, prev) => {
            const meta = tr.getMeta(NOTE_COMMENT_INDICATOR_META);
            if (typeof meta === 'number' && Number.isFinite(meta)) return { tick: meta };
            return prev;
          },
        },
        view: (view) => {
          if (!yDoc) return {};
          let tick = 0;
          const unobs = observeComments(yDoc, () => {
            tick += 1;
            try {
              // Trigger a state update so decorations recompute.
              view.dispatch(view.state.tr.setMeta(NOTE_COMMENT_INDICATOR_META, tick));
            } catch {
              // ignore
            }
          });
          return {
            destroy: () => {
              try {
                unobs();
              } catch {
                // ignore
              }
            },
          };
        },
        props: {
          decorations: (state) => {
            if (!yDoc) return null;
            const threads = getAllThreads(yDoc);
            const markType = state.schema.marks.comment;
            if (!markType) return null;

            const endPosById = new Map<string, number>();
            state.doc.nodesBetween(0, state.doc.content.size, (node, pos) => {
              if (!node.isText) return true;
              if (!node.marks || node.marks.length === 0) return true;
              const m = node.marks.find((x) => x.type === markType) || null;
              if (!m) return true;
              const id = String((m.attrs as any)?.id || '').trim();
              if (!id) return true;
              const targetKey = `note:r:${id}`;
              if (!threads[targetKey]) return true; // only show indicator for real threads
              const endPos = pos + node.nodeSize;
              const cur = endPosById.get(id);
              if (typeof cur !== 'number' || endPos > cur) endPosById.set(id, endPos);
              return true;
            });

            const decos: Decoration[] = [];
            endPosById.forEach((endPos, id) => {
              const targetKey = `note:r:${id}`;
              decos.push(
                Decoration.widget(
                  endPos,
                  () => makeIconButton({ targetKey, title: 'Open comment' }),
                  { side: 1, key: `note-comment-indicator:${id}` },
                ),
              );
            });
            if (!decos.length) return null;
            return DecorationSet.create(state.doc, decos);
          },
        },
      }),
    ];
  },
});

