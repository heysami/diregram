'use client';

import type { Editor } from '@tiptap/react';
import { TextSelection } from '@tiptap/pm/state';

export function runNoteSlashCommand(opts: {
  editor: Editor;
  cmd: string;
  slashPos: number;
  setDebugText?: (s: string | null) => void;
  setErrorText?: (s: string | null) => void;
  onCloseMenu?: () => void;
}): boolean {
  const { editor, cmd, slashPos, setDebugText, setErrorText, onCloseMenu } = opts;
  let didSetError = false;
  const setErr = (s: string | null) => {
    if (s) didSetError = true;
    setErrorText?.(s);
  };
  const setDbg = (s: string | null) => setDebugText?.(s);

  setErr(null);
  setDbg(`run: ${cmd}`);

  // Restore selection to where slash was typed (mouse clicks can steal focus/selection).
  try {
    const pos = Math.max(0, Number(slashPos) || editor.state.selection.from);
    editor.commands.setTextSelection(pos);
  } catch {
    // ignore
  }

  // Remove the slash trigger (it may be at the cursor, or just before it, depending on selection restoration).
  try {
    const { from } = editor.state.selection;
    const at = editor.state.doc.textBetween(from, Math.min(from + 1, editor.state.doc.content.size), '\n', '\n');
    const prev = editor.state.doc.textBetween(Math.max(0, from - 1), from, '\n', '\n');
    if (at === '/') editor.commands.deleteRange({ from, to: from + 1 });
    else if (prev === '/') editor.commands.deleteRange({ from: from - 1, to: from });
  } catch {
    // ignore
  }

  const replaceParentBlock = (nodeJson: any): boolean => {
    try {
      const ok = editor.commands.command(({ tr, state, dispatch }) => {
        const $from = (state.selection as any).$from;
        if (!$from) return false;
        if (typeof $from.before !== 'function' || typeof $from.after !== 'function') return false;
        if ($from.depth < 1) return false;
        const from = $from.before(1);
        const to = $from.after(1);
        let node: any = null;
        try {
          node = state.schema.nodeFromJSON(nodeJson);
        } catch {
          return false;
        }
        tr.replaceRangeWith(from, to, node);
        // Place cursor somewhere inside/after the inserted node.
        const nextSelPos = Math.min(from + 1, tr.doc.content.size);
        tr.setSelection(TextSelection.near(tr.doc.resolve(nextSelPos)));
        if (dispatch) dispatch(tr.scrollIntoView());
        return true;
      });
      return Boolean(ok);
    } catch {
      return false;
    }
  };

  const insertOrReplaceBlock = (nodeJson: any): boolean => {
    // Before we do anything, confirm the node type exists in the schema.
    const typeName = String(nodeJson?.type || '').trim();
    if (typeName) {
      const exists = Boolean((editor.state.schema as any)?.nodes?.[typeName]);
      if (!exists) {
        const msg = `Unknown node type "${typeName}" (schema missing extension)`;
        setErr(msg);
        // eslint-disable-next-line no-console
        console.error(msg, { available: Object.keys((editor.state.schema as any)?.nodes || {}) });
        return false;
      }
    }

    // Prefer replacing the current block (Notion-like). If that fails, fall back to insertion.
    if (replaceParentBlock(nodeJson)) return true;

    // Fallback 1: insert at current selection (TipTap helper)
    try {
      const ok = editor.chain().focus().insertContent(nodeJson).run();
      if (ok) return true;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('insertContent failed', e);
    }

    // Fallback 2: insert at end of doc (guaranteed visible)
    try {
      const ok = editor.commands.command(({ tr, state, dispatch }) => {
        const endPos = Math.max(0, state.doc.content.size);
        let node: any = null;
        try {
          node = state.schema.nodeFromJSON(nodeJson);
        } catch (e) {
          const msg = `nodeFromJSON failed for "${typeName}"`;
          setErr(msg);
          // eslint-disable-next-line no-console
          console.error(msg, e);
          return false;
        }
        tr.insert(endPos, node);
        if (dispatch) dispatch(tr.scrollIntoView());
        return true;
      });
      return Boolean(ok);
    } catch (e) {
      const msg = `Insert failed for "${typeName}"`;
      setErr(msg);
      // eslint-disable-next-line no-console
      console.error(msg, e);
      return false;
    }
  };

  // Apply transform/insert. Prefer deterministic “set” commands over toggles.
  let ok = true;
  if (cmd === 'h1') ok = editor.chain().focus().setNode('heading', { level: 1 }).run();
  else if (cmd === 'h2') ok = editor.chain().focus().setNode('heading', { level: 2 }).run();
  else if (cmd === 'h3') ok = editor.chain().focus().setNode('heading', { level: 3 }).run();
  else if (cmd === 'bullet') ok = editor.chain().focus().toggleBulletList().run();
  else if (cmd === 'ordered') ok = editor.chain().focus().toggleOrderedList().run();
  else if (cmd === 'todo') ok = editor.chain().focus().toggleTaskList().run();
  else if (cmd === 'quote') ok = editor.chain().focus().toggleBlockquote().run();
  else if (cmd === 'code') ok = editor.chain().focus().toggleCodeBlock().run();
  else if (cmd === 'hr') ok = editor.chain().focus().setHorizontalRule().run();
  else if (cmd === 'toggle') {
    ok = insertOrReplaceBlock({
      type: 'nexusToggle',
      attrs: { title: 'Toggle', open: true },
      content: [{ type: 'paragraph' }],
    });
  } else if (cmd === 'box') {
    ok = insertOrReplaceBlock({
      type: 'nexusBox',
      attrs: { title: '' },
      content: [{ type: 'paragraph' }],
    });
  } else if (cmd === 'tabs') {
    ok = insertOrReplaceBlock({
      type: 'nexusTabs',
      attrs: { activeId: 'tab-1' },
      content: [
        { type: 'nexusTab', attrs: { tabId: 'tab-1', title: 'Tab 1' }, content: [{ type: 'paragraph' }] },
        { type: 'nexusTab', attrs: { tabId: 'tab-2', title: 'Tab 2' }, content: [{ type: 'paragraph' }] },
      ],
    });
  } else if (cmd === 'embed') {
    const raw = JSON.stringify({ id: `embed-${crypto.randomUUID()}`, kind: 'systemflow', ref: 'systemflow-1' }, null, 2);
    ok = insertOrReplaceBlock({ type: 'nexusEmbed', attrs: { raw } });
  } else if (cmd === 'table') {
    const raw = JSON.stringify({ id: `table-${crypto.randomUUID()}`, mode: 'intersection', sources: [] }, null, 2);
    ok = insertOrReplaceBlock({ type: 'nexusTable', attrs: { raw } });
  } else if (cmd === 'test') {
    const raw = JSON.stringify({ id: `test-${crypto.randomUUID()}`, testId: '' }, null, 2);
    ok = insertOrReplaceBlock({ type: 'nexusTest', attrs: { raw } });
  }

  if (ok) onCloseMenu?.();
  else if (!didSetError) setErr('Command failed to apply (see console).');

  return Boolean(ok);
}

