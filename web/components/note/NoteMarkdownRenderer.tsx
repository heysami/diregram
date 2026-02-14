'use client';

import { useMemo } from 'react';
import * as React from 'react';
import type * as Y from 'yjs';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import type { Components } from 'react-markdown';
import { macrosToHtml, listRecognizedMacros } from '@/lib/grid-cell-macros';
import { NX_SANITIZE_SCHEMA } from '@/components/grid/cell/markdown/nxMarkdownSchema';
import { createNxMarkdownComponents } from '@/components/grid/cell/markdown/nxMarkdownComponents';
import { nxSemanticBgColor, nxSemanticTextColor } from '@/lib/grid/nxSemanticColor';
import type { GridPersonV1 } from '@/lib/gridjson';
import { NexusEmbedBlock } from '@/components/note/embeds/NexusEmbedBlock';
import { NexusTableBlock } from '@/components/note/embeds/NexusTableBlock';
import { NexusTestBlock } from '@/components/note/embeds/NexusTestBlock';

function replaceMacroAtOcc(markdown: string, occ: number, nextRaw: string): string {
  if (occ < 0) return markdown;
  const macros = listRecognizedMacros(markdown);
  const m = macros.find((x) => x.occ === occ) || null;
  if (!m) return markdown;
  return markdown.slice(0, m.start) + nextRaw + markdown.slice(m.end);
}

export function NoteMarkdownRenderer({
  hostDoc,
  markdown,
  headingIds,
  onChangeMarkdown,
  commentMode = false,
  onOpenComments,
  peopleDirectory = [],
}: {
  hostDoc: Y.Doc;
  markdown: string;
  /** In render order (matches headings in markdown). */
  headingIds: string[];
  onChangeMarkdown?: (next: string) => void;
  commentMode?: boolean;
  onOpenComments?: (info: { targetKey: string; targetLabel?: string }) => void;
  peopleDirectory?: GridPersonV1[];
}) {
  const src = useMemo(() => macrosToHtml(markdown), [markdown]);

  const components = useMemo(() => {
    let headingIdx = 0;
    const base = createNxMarkdownComponents({
      pillsExpandAll: true,
      peopleDirectory,
      onReplaceMacro: (occ, nextRaw) => {
        if (!onChangeMarkdown) return;
        onChangeMarkdown(replaceMacroAtOcc(markdown, occ, nextRaw));
      },
      onTransformText: onChangeMarkdown ? (transform) => onChangeMarkdown(transform(markdown)) : undefined,
      onOpenPopover: () => {
        // Not supported (yet) in Notes; keep markdown-first UX simple.
      },
    });

    // Override semantic coloring for Notes:
    // - allow background highlight in the document itself (uppercase kinds)
    // - keep semantic palette fixed (no arbitrary colors)
    const nxColor = ({ children, kind, mode }: { children: any; kind?: string; mode?: string }) => {
      const m = String(mode || 'text').trim().toLowerCase();
      const fg = nxSemanticTextColor(kind);
      const bg = nxSemanticBgColor(kind);
      return (
        <span
          className="rounded px-0.5"
          style={{
            color: fg,
            background: m === 'bg' ? bg : undefined,
          }}
        >
          {children}
        </span>
      );
    };

    const headingCommon = (Tag: any, extraClass: string) => {
      const id = headingIds[headingIdx++] || undefined;
      return ({ children }: { children?: any }) => (
        <Tag id={id} className={`scroll-mt-24 ${extraClass}`}>
          {children}
        </Tag>
      );
    };

    const out: any = {
      ...base,
      'nx-color': nxColor as any,

      // Give headings consistent spacing in “doc” mode.
      h1: headingCommon('h1', 'mt-6 mb-3 text-3xl font-bold tracking-tight'),
      h2: headingCommon('h2', 'mt-6 mb-2 text-2xl font-bold tracking-tight'),
      h3: headingCommon('h3', 'mt-5 mb-2 text-xl font-semibold tracking-tight'),
      h4: headingCommon('h4', 'mt-4 mb-2 text-lg font-semibold tracking-tight'),
      h5: headingCommon('h5', 'mt-4 mb-1 text-base font-semibold tracking-tight opacity-90'),
      h6: headingCommon('h6', 'mt-4 mb-1 text-sm font-semibold tracking-tight opacity-80'),

      p: ({ children }: { children?: React.ReactNode }) => <p className="my-2 leading-relaxed">{children}</p>,
      ul: ({ children }: { children?: React.ReactNode }) => <ul className="my-2 pl-6 list-disc">{children}</ul>,
      ol: ({ children }: { children?: React.ReactNode }) => <ol className="my-2 pl-6 list-decimal">{children}</ol>,
      li: ({ children }: { children?: React.ReactNode }) => <li className="my-1">{children}</li>,
      blockquote: ({ children }: { children?: React.ReactNode }) => (
        <blockquote className="my-3 border-l-4 border-slate-200 pl-3 text-slate-700">{children}</blockquote>
      ),
      hr: () => <hr className="my-6 border-slate-200" />,
      table: ({ children }: { children?: React.ReactNode }) => (
        <div className="my-3 overflow-x-auto">
          <table className="min-w-[520px] border-collapse text-sm">{children}</table>
        </div>
      ),
      th: ({ children }: { children?: React.ReactNode }) => (
        <th className="border border-slate-200 bg-slate-50 px-2 py-1 text-left font-semibold">{children}</th>
      ),
      td: ({ children }: { children?: React.ReactNode }) => <td className="border border-slate-200 px-2 py-1 align-top">{children}</td>,

      // Embed blocks (fenced code blocks).
      pre: ({ children }: { children?: React.ReactNode }) => {
        const child = Array.isArray(children) ? children[0] : children;
        if (React.isValidElement(child)) {
          const cn = String((child.props as any)?.className || '');
          if (cn.includes('language-nexus-embed') || cn.includes('language-nexus-table') || cn.includes('language-nexus-test')) {
            return <div className="my-2">{child}</div>;
          }
        }
        return <pre className="my-3 p-2 rounded bg-slate-100 overflow-x-auto text-[12px] leading-snug">{children}</pre>;
      },
      code: ({
        inline,
        className,
        children,
      }: {
        inline?: boolean;
        className?: string;
        children?: React.ReactNode;
      }) => {
        const cn = String(className || '');
        const lang = cn.startsWith('language-') ? cn.slice('language-'.length) : cn.replace(/^language-/, '');
        const raw = String(children || '').replace(/\n$/, '');

        if (!inline && lang === 'nexus-embed')
          return <NexusEmbedBlock hostDoc={hostDoc} raw={raw} commentMode={commentMode} onOpenComments={onOpenComments} />;
        if (!inline && lang === 'nexus-table')
          return <NexusTableBlock hostDoc={hostDoc} raw={raw} commentMode={commentMode} onOpenComments={onOpenComments} />;
        if (!inline && lang === 'nexus-test')
          return <NexusTestBlock hostDoc={hostDoc} raw={raw} commentMode={commentMode} onOpenComments={onOpenComments} />;

        return (
          <code className="px-0.5 py-[1px] rounded bg-slate-100 font-mono text-[12px]">
            {children}
          </code>
        );
      },
    };
    return out as Components;
  }, [headingIds, markdown, onChangeMarkdown, peopleDirectory, hostDoc, commentMode, onOpenComments]);

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkBreaks]}
      rehypePlugins={[rehypeRaw, [rehypeSanitize, NX_SANITIZE_SCHEMA]]}
      components={components as any}
    >
      {src}
    </ReactMarkdown>
  );
}

