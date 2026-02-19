import { DOMParser as PMDOMParser, DOMSerializer as PMDOMSerializer } from '@tiptap/pm/model';
import type { EditorView } from '@tiptap/pm/view';

export function serializeProseMirrorSelection(view: EditorView): { html: string; text: string } | null {
  try {
    const sel = view.state.selection;
    if (!sel || sel.empty) return null;
    const slice = sel.content();
    const serializer = PMDOMSerializer.fromSchema(view.state.schema);
    const wrap = document.createElement('div');
    wrap.appendChild(serializer.serializeFragment(slice.content));
    const html = wrap.innerHTML || '';
    const text = view.state.doc.textBetween(sel.from, sel.to, '\n', '\n');
    return { html, text };
  } catch {
    return null;
  }
}

export function replaceSelectionWithHtml(view: EditorView, htmlRaw: string): boolean {
  try {
    const html = String(htmlRaw || '').trim();
    if (!html) return false;
    const body = new window.DOMParser().parseFromString(html, 'text/html').body;
    const slice = PMDOMParser.fromSchema(view.state.schema).parseSlice(body);
    view.dispatch(view.state.tr.replaceSelection(slice).scrollIntoView());
    return true;
  } catch {
    return false;
  }
}

