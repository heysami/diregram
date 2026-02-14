'use client';

import type { JSONContent } from '@tiptap/core';

function normalizeNewlines(s: string): string {
  return String(s || '').replace(/\r\n?/g, '\n');
}

function textNode(text: string): JSONContent {
  return { type: 'text', text };
}

function textNodeWithMarks(text: string, marks: JSONContent['marks'] | undefined): JSONContent {
  const n: any = { type: 'text', text };
  if (marks && marks.length) n.marks = marks;
  return n as JSONContent;
}

function parseInlineWithComments(text: string): JSONContent[] {
  const s = String(text || '');
  const out: JSONContent[] = [];
  let i = 0;
  while (i < s.length) {
    const open = s.indexOf('[[comment:', i);
    if (open === -1) {
      const tail = s.slice(i);
      if (tail) out.push(textNode(tail));
      break;
    }
    const before = s.slice(i, open);
    if (before) out.push(textNode(before));
    const closeBracket = s.indexOf(']]', open);
    if (closeBracket === -1) {
      out.push(textNode(s.slice(open)));
      break;
    }
    const id = s.slice(open + '[[comment:'.length, closeBracket).trim();
    const closeTag = '[[/comment]]';
    const close = s.indexOf(closeTag, closeBracket + 2);
    if (close === -1) {
      // No close tag; treat as literal.
      out.push(textNode(s.slice(open, closeBracket + 2)));
      i = closeBracket + 2;
      continue;
    }
    const body = s.slice(closeBracket + 2, close);
    if (body) {
      out.push(textNodeWithMarks(body, [{ type: 'comment', attrs: { id } }] as any));
    }
    i = close + closeTag.length;
  }
  return out;
}

function paragraph(text: string): JSONContent {
  const content = parseInlineWithComments(text);
  return { type: 'paragraph', content };
}

function heading(level: number, text: string): JSONContent {
  const content = parseInlineWithComments(text);
  return { type: 'heading', attrs: { level }, content };
}

function hr(): JSONContent {
  return { type: 'horizontalRule' };
}

function safeJsonPretty(raw: string): string {
  try {
    const parsed = JSON.parse(raw);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return String(raw || '').trim();
  }
}

function safeJsonParse(raw: string): any {
  try {
    return JSON.parse(String(raw || '{}'));
  } catch {
    return null;
  }
}

function nexusEmbed(raw: string): JSONContent {
  return { type: 'nexusEmbed', attrs: { raw: safeJsonPretty(raw) } };
}
function nexusTable(raw: string): JSONContent {
  return { type: 'nexusTable', attrs: { raw: safeJsonPretty(raw) } };
}
function nexusTest(raw: string): JSONContent {
  return { type: 'nexusTest', attrs: { raw: safeJsonPretty(raw) } };
}

function nexusBox(raw: string): JSONContent {
  const parsed = safeJsonParse(raw) || {};
  const title = String(parsed?.title || '');
  const md = String(parsed?.md || '');
  const inner = parseMarkdownToTiptap(md);
  return { type: 'nexusBox', attrs: { title }, content: Array.isArray(inner.content) ? inner.content : [] };
}

function nexusToggle(raw: string): JSONContent {
  const parsed = safeJsonParse(raw) || {};
  const title = String(parsed?.title || 'Toggle');
  const open = parsed?.open === false ? false : true;
  const md = String(parsed?.md || '');
  const inner = parseMarkdownToTiptap(md);
  return { type: 'nexusToggle', attrs: { title, open }, content: Array.isArray(inner.content) ? inner.content : [] };
}

function nexusColumns(raw: string): JSONContent {
  const parsed = safeJsonParse(raw) || {};
  const cols = Array.isArray(parsed?.columns) ? (parsed.columns as any[]) : [];
  const content: JSONContent[] = cols.map((md) => {
    const inner = parseMarkdownToTiptap(String(md || ''));
    return { type: 'nexusColumn', content: Array.isArray(inner.content) ? inner.content : [] };
  });
  return { type: 'nexusColumns', content: content.length ? content : [{ type: 'nexusColumn', content: [paragraph('')] }] };
}

function nexusTabs(raw: string): JSONContent {
  const parsed = safeJsonParse(raw) || {};
  const tabs = Array.isArray(parsed?.tabs) ? (parsed.tabs as any[]) : [];
  const content: JSONContent[] = tabs.map((t, idx) => {
    const tabId = String(t?.id || '').trim() || `tab-${idx + 1}`;
    const title = String(t?.title || `Tab ${idx + 1}`);
    const md = String(t?.md || '');
    const inner = parseMarkdownToTiptap(md);
    return { type: 'nexusTab', attrs: { tabId, title }, content: Array.isArray(inner.content) ? inner.content : [] };
  });
  const activeId =
    String(parsed?.activeId || '').trim() || (content[0] ? String((content[0].attrs as any)?.tabId || 'tab-1') : 'tab-1');
  return {
    type: 'nexusTabs',
    attrs: { activeId },
    content: content.length ? content : [{ type: 'nexusTab', attrs: { tabId: 'tab-1', title: 'Tab 1' }, content: [paragraph('')] }],
  };
}

function codeBlock(language: string | null, code: string): JSONContent {
  const attrs = language ? { language } : {};
  return { type: 'codeBlock', attrs, content: [textNode(code)] };
}

function blockquote(text: string): JSONContent {
  // Minimal: store as a single paragraph inside.
  return { type: 'blockquote', content: [paragraph(text)] };
}

function bulletItem(text: string): JSONContent {
  return { type: 'listItem', content: [paragraph(text)] };
}

function orderedItem(text: string): JSONContent {
  return { type: 'listItem', content: [paragraph(text)] };
}

function taskItem(text: string, checked: boolean): JSONContent {
  return { type: 'taskItem', attrs: { checked }, content: [paragraph(text)] };
}

export function parseMarkdownToTiptap(markdown: string): JSONContent {
  const md = normalizeNewlines(markdown);
  const lines = md.split('\n');

  const doc: JSONContent = { type: 'doc', content: [] };
  const out = doc.content as JSONContent[];

  let i = 0;
  let inFence = false;
  let fenceLang: string | null = null;
  let fenceBuf: string[] = [];

  const flushFence = () => {
    const code = fenceBuf.join('\n');
    const lang = String(fenceLang || '').trim().toLowerCase();
    if (lang === 'nexus-embed') out.push(nexusEmbed(code));
    else if (lang === 'nexus-table') out.push(nexusTable(code));
    else if (lang === 'nexus-test') out.push(nexusTest(code));
    else if (lang === 'nexus-box') out.push(nexusBox(code));
    else if (lang === 'nexus-toggle') out.push(nexusToggle(code));
    else if (lang === 'nexus-columns') out.push(nexusColumns(code));
    else if (lang === 'nexus-tabs') out.push(nexusTabs(code));
    else out.push(codeBlock(fenceLang, code));
    fenceBuf = [];
    fenceLang = null;
  };

  while (i < lines.length) {
    const line = lines[i] ?? '';

    const fenceMatch = line.match(/^```(\S+)?\s*$/);
    if (fenceMatch) {
      if (!inFence) {
        inFence = true;
        fenceLang = fenceMatch[1] ? String(fenceMatch[1]) : null;
      } else {
        inFence = false;
        flushFence();
      }
      i += 1;
      continue;
    }
    if (inFence) {
      fenceBuf.push(line);
      i += 1;
      continue;
    }

    if (/^\s*$/.test(line)) {
      i += 1;
      continue;
    }

    const h = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (h) {
      out.push(heading(h[1].length, String(h[2] || '').trim()));
      i += 1;
      continue;
    }

    if (/^\s*---\s*$/.test(line)) {
      out.push(hr());
      i += 1;
      continue;
    }

    const quote = line.match(/^\s*>\s?(.*)$/);
    if (quote) {
      out.push(blockquote(String(quote[1] || '').trim()));
      i += 1;
      continue;
    }

    // Task list item: - [ ] text / - [x] text
    const task = line.match(/^\s*[-*]\s+\[([ xX])\]\s+(.*)$/);
    if (task) {
      const checked = String(task[1] || '').toLowerCase() === 'x';
      const text = String(task[2] || '');
      // Group consecutive tasks into one taskList.
      const items: JSONContent[] = [taskItem(text, checked)];
      i += 1;
      while (i < lines.length) {
        const m = (lines[i] || '').match(/^\s*[-*]\s+\[([ xX])\]\s+(.*)$/);
        if (!m) break;
        items.push(taskItem(String(m[2] || ''), String(m[1] || '').toLowerCase() === 'x'));
        i += 1;
      }
      out.push({ type: 'taskList', content: items });
      continue;
    }

    // Bullet list: - item
    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    if (bullet) {
      const items: JSONContent[] = [bulletItem(String(bullet[1] || ''))];
      i += 1;
      while (i < lines.length) {
        const m = (lines[i] || '').match(/^\s*[-*]\s+(.*)$/);
        if (!m) break;
        items.push(bulletItem(String(m[1] || '')));
        i += 1;
      }
      out.push({ type: 'bulletList', content: items });
      continue;
    }

    // Ordered list: 1. item
    const ordered = line.match(/^\s*(\d+)\.\s+(.*)$/);
    if (ordered) {
      const start = Math.max(1, Number.parseInt(String(ordered[1] || '1'), 10) || 1);
      const items: JSONContent[] = [orderedItem(String(ordered[2] || ''))];
      i += 1;
      while (i < lines.length) {
        const m = (lines[i] || '').match(/^\s*(\d+)\.\s+(.*)$/);
        if (!m) break;
        items.push(orderedItem(String(m[2] || '')));
        i += 1;
      }
      out.push({ type: 'orderedList', attrs: { start }, content: items });
      continue;
    }

    // Fallback: paragraph; merge consecutive non-blank lines.
    const buf: string[] = [line];
    i += 1;
    while (i < lines.length && !/^\s*$/.test(lines[i] || '')) {
      // stop before structures
      const next = lines[i] || '';
      if (
        /^```/.test(next) ||
        /^\s{0,3}#{1,6}\s+/.test(next) ||
        /^\s*---\s*$/.test(next) ||
        /^\s*>/.test(next) ||
        /^\s*[-*]\s+\[([ xX])\]\s+/.test(next) ||
        /^\s*[-*]\s+/.test(next) ||
        /^\s*\d+\.\s+/.test(next)
      ) {
        break;
      }
      buf.push(next);
      i += 1;
    }
    out.push(paragraph(buf.join('\n')));
  }

  // Unterminated fence
  if (inFence) flushFence();
  return doc;
}

function serializeInlineText(node: JSONContent | undefined): string {
  if (!node) return '';
  if (node.type === 'text') {
    const text = String(node.text || '');
    const marks = Array.isArray((node as any).marks) ? ((node as any).marks as any[]) : [];
    const comment = marks.find((m) => m?.type === 'comment') || null;
    if (comment) {
      const id = String(comment?.attrs?.id || '').trim();
      return `[[comment:${id}]]${text}[[/comment]]`;
    }
    return text;
  }
  if (Array.isArray(node.content)) return node.content.map(serializeInlineText).join('');
  return '';
}

export function serializeTiptapToMarkdown(doc: JSONContent): string {
  const blocks = Array.isArray(doc.content) ? doc.content : [];
  const out: string[] = [];

  const emit = (s: string) => out.push(s);
  const emitBlank = () => {
    if (out.length === 0) return;
    if (out[out.length - 1] !== '') out.push('');
  };

  const serializeBlocks = (innerBlocks: JSONContent[]): string => {
    const md = serializeTiptapToMarkdown({ type: 'doc', content: innerBlocks } as any);
    return md.replace(/\n$/, '');
  };

  blocks.forEach((b) => {
    if (!b || typeof b !== 'object') return;
    switch (b.type) {
      case 'nexusEmbed': {
        const raw = String((b.attrs as any)?.raw || '').trim();
        emit('```nexus-embed');
        emit(raw);
        emit('```');
        emitBlank();
        return;
      }
      case 'nexusTable': {
        const raw = String((b.attrs as any)?.raw || '').trim();
        emit('```nexus-table');
        emit(raw);
        emit('```');
        emitBlank();
        return;
      }
      case 'nexusTest': {
        const raw = String((b.attrs as any)?.raw || '').trim();
        emit('```nexus-test');
        emit(raw);
        emit('```');
        emitBlank();
        return;
      }
      case 'nexusBox': {
        const title = String((b.attrs as any)?.title || '');
        const md = serializeBlocks(Array.isArray(b.content) ? b.content : []);
        emit('```nexus-box');
        emit(
          JSON.stringify(
            {
              title,
              md,
            },
            null,
            2,
          ).trimEnd(),
        );
        emit('```');
        emitBlank();
        return;
      }
      case 'nexusToggle': {
        const title = String((b.attrs as any)?.title || 'Toggle');
        const open = (b.attrs as any)?.open === false ? false : true;
        const md = serializeBlocks(Array.isArray(b.content) ? b.content : []);
        emit('```nexus-toggle');
        emit(
          JSON.stringify(
            {
              title,
              open,
              md,
            },
            null,
            2,
          ).trimEnd(),
        );
        emit('```');
        emitBlank();
        return;
      }
      case 'nexusColumns': {
        const cols = Array.isArray(b.content) ? b.content : [];
        const columns = cols
          .filter((c) => (c as any)?.type === 'nexusColumn')
          .map((c) => serializeBlocks(Array.isArray((c as any).content) ? ((c as any).content as JSONContent[]) : []));
        emit('```nexus-columns');
        emit(JSON.stringify({ columns }, null, 2).trimEnd());
        emit('```');
        emitBlank();
        return;
      }
      case 'nexusTabs': {
        const activeId = String((b.attrs as any)?.activeId || '').trim() || 'tab-1';
        const tabs = (Array.isArray(b.content) ? b.content : [])
          .filter((t) => (t as any)?.type === 'nexusTab')
          .map((t, idx) => {
            const tabId = String((t as any)?.attrs?.tabId || '').trim() || `tab-${idx + 1}`;
            const title = String((t as any)?.attrs?.title || `Tab ${idx + 1}`);
            const md = serializeBlocks(Array.isArray((t as any).content) ? ((t as any).content as JSONContent[]) : []);
            return { id: tabId, title, md };
          });
        emit('```nexus-tabs');
        emit(JSON.stringify({ activeId, tabs }, null, 2).trimEnd());
        emit('```');
        emitBlank();
        return;
      }
      case 'heading': {
        const level = Math.max(1, Math.min(6, Number((b.attrs as any)?.level) || 1));
        emit(`${'#'.repeat(level)} ${serializeInlineText(b)}`.trimEnd());
        emitBlank();
        return;
      }
      case 'paragraph': {
        const t = serializeInlineText(b);
        emit(t);
        emitBlank();
        return;
      }
      case 'horizontalRule': {
        emit('---');
        emitBlank();
        return;
      }
      case 'blockquote': {
        const inner = Array.isArray(b.content) ? b.content : [];
        const text = inner.map(serializeInlineText).join('\n');
        text.split('\n').forEach((ln) => emit(`> ${ln}`.trimEnd()));
        emitBlank();
        return;
      }
      case 'codeBlock': {
        const lang = String((b.attrs as any)?.language || '').trim();
        emit(`\`\`\`${lang || ''}`.trimEnd());
        emit(serializeInlineText(b));
        emit('```');
        emitBlank();
        return;
      }
      case 'bulletList': {
        const items = Array.isArray(b.content) ? b.content : [];
        items.forEach((it) => {
          const t = serializeInlineText(it);
          emit(`- ${t}`.trimEnd());
        });
        emitBlank();
        return;
      }
      case 'orderedList': {
        const items = Array.isArray(b.content) ? b.content : [];
        const start = Math.max(1, Number((b.attrs as any)?.start) || 1);
        items.forEach((it, idx) => {
          const t = serializeInlineText(it);
          emit(`${start + idx}. ${t}`.trimEnd());
        });
        emitBlank();
        return;
      }
      case 'taskList': {
        const items = Array.isArray(b.content) ? b.content : [];
        items.forEach((it) => {
          const checked = Boolean((it.attrs as any)?.checked);
          const t = serializeInlineText(it);
          emit(`- [${checked ? 'x' : ' '}] ${t}`.trimEnd());
        });
        emitBlank();
        return;
      }
      default: {
        // Unknown block → text fallback.
        const t = serializeInlineText(b);
        if (t.trim().length) {
          emit(t);
          emitBlank();
        }
      }
    }
  });

  // Trim trailing blank lines, ensure newline at end.
  while (out.length && out[out.length - 1] === '') out.pop();
  return out.join('\n') + '\n';
}

