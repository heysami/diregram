'use client';

import type { Editor } from '@tiptap/react';
import { NodeSelection } from '@tiptap/pm/state';

export function selectNearestBlockAtCoords(editor: Editor, coords: { left: number; top: number }): number | null {
  const view = editor.view;
  const result = view.posAtCoords(coords);
  if (!result) return null;
  const pos = result.pos;
  const $pos = editor.state.doc.resolve(pos);
  // Prefer selecting the top-level block under the doc (depth 1).
  // `before(1)` is the position *before* that node, which is the correct anchor for NodeSelection.
  const nodePos = $pos.depth >= 1 ? $pos.before(1) : pos;
  try {
    const sel = NodeSelection.create(editor.state.doc, nodePos);
    editor.view.dispatch(editor.state.tr.setSelection(sel));
    editor.commands.focus();
    return sel.from;
  } catch {
    return null;
  }
}

export function moveSelectedBlock(editor: Editor, dir: 'up' | 'down'): void {
  const { state, view } = editor;
  const sel = state.selection;
  if (!(sel instanceof NodeSelection)) return;
  const from = sel.from;
  const node = state.doc.nodeAt(from);
  if (!node) return;
  const before = state.doc.resolve(from);
  const parent = before.parent;
  const index = before.index();
  const parentPos = before.before();

  const targetIndex = dir === 'up' ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= parent.childCount) return;

  const targetNode = parent.child(targetIndex);
  const targetPos = parentPos + parent.childBefore(from - parentPos).offset;

  // Simple swap by deleting+inserting slices (sufficient for MVP).
  const tr = state.tr;
  if (dir === 'up') {
    const aFrom = targetPos;
    const aTo = aFrom + targetNode.nodeSize;
    const bFrom = from;
    const bTo = bFrom + node.nodeSize;
    const aSlice = state.doc.slice(aFrom, aTo);
    const bSlice = state.doc.slice(bFrom, bTo);
    tr.replaceRange(bFrom, bTo, aSlice);
    tr.replaceRange(aFrom, aTo, bSlice);
  } else {
    const aFrom = from;
    const aTo = aFrom + node.nodeSize;
    const bFrom = targetPos;
    const bTo = bFrom + targetNode.nodeSize;
    const aSlice = state.doc.slice(aFrom, aTo);
    const bSlice = state.doc.slice(bFrom, bTo);
    tr.replaceRange(bFrom, bTo, aSlice);
    tr.replaceRange(aFrom, aTo, bSlice);
  }
  view.dispatch(tr.scrollIntoView());
}

