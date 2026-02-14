import { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import type { GridPersonV1 } from '@/lib/gridjson';
import { macrosToHtml } from '@/lib/grid-cell-macros';
import { GRID_MARKDOWN_LOOKS_RICH_RE } from '@/components/grid/cell/markdown/markdownSyntax';
import { NX_SANITIZE_SCHEMA } from '@/components/grid/cell/markdown/nxMarkdownSchema';
import { createNxMarkdownComponents, type MacroPopoverKind } from '@/components/grid/cell/markdown/nxMarkdownComponents';

export const CellMarkdown = memo(function CellMarkdown({
  value,
  pillsExpandAll,
  peopleDirectory,
  onReplaceMacro,
  onTransformText,
  onOpenPopover,
}: {
  value: string;
  pillsExpandAll: boolean;
  peopleDirectory: GridPersonV1[];
  onReplaceMacro: (occ: number, nextRaw: string) => void;
  onTransformText?: (transform: (prev: string) => string) => void;
  onOpenPopover: (kind: MacroPopoverKind, occ: number, body: string, anchorEl: HTMLElement) => void;
}) {
  const looksRich = GRID_MARKDOWN_LOOKS_RICH_RE.test(value);
  if (!looksRich) return <>{value}</>;

  const src = macrosToHtml(value);
  const components = createNxMarkdownComponents({
    pillsExpandAll,
    peopleDirectory,
    onReplaceMacro,
    onTransformText,
    onOpenPopover,
  });

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkBreaks]}
      rehypePlugins={[rehypeRaw, [rehypeSanitize, NX_SANITIZE_SCHEMA]]}
      components={components as any}
    >
      {src}
    </ReactMarkdown>
  );
});

