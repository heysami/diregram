import type { GridDoc, GridSheetV1 } from '@/lib/gridjson';
import type { MarkdownDocView } from '@/components/grid/MarkdownDocModal';
import { stripDefaultSizingFromDoc, stripDefaultSizingFromSheet } from '@/lib/grid/stripDefaultSizing';
import { buildGroupingSemanticTreeForSheet } from '@/lib/grid/tableSemanticTree';

export function buildMarkdownDocViews(opts: {
  rawMarkdown: string | undefined;
  doc: GridDoc;
  activeSheet: GridSheetV1 | null;
}): MarkdownDocView[] {
  const raw = String(opts.rawMarkdown || '');
  const simplifiedDoc = stripDefaultSizingFromDoc(opts.doc);
  const simplifiedSheet = opts.activeSheet ? stripDefaultSizingFromSheet(opts.activeSheet) : null;
  const groupingSemantics = opts.activeSheet ? buildGroupingSemanticTreeForSheet(opts.activeSheet) : '(No active sheet.)';

  return [
    { id: 'raw', label: 'Raw markdown', text: raw },
    { id: 'doc', label: 'Grid JSON (doc, simplified sizing)', text: JSON.stringify(simplifiedDoc, null, 2) },
    {
      id: 'sheet',
      label: 'Active sheet JSON (simplified sizing)',
      text: JSON.stringify(
        {
          sheetId: opts.activeSheet?.id || null,
          sheetName: opts.activeSheet?.name || null,
          sheet: simplifiedSheet,
        },
        null,
        2,
      ),
    },
    { id: 'grouping', label: 'IMPORTANT: Grouping semantics (tree)', text: groupingSemantics },
  ];
}

