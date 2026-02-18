import type { GridTableV1 } from '@/lib/gridjson';

export function StickyBars({
  activeTable,
  cellSelectionCount,
  activeRegionId,
  onSetHeaderRows,
  onSetHeaderCols,
  onSetFooterRows,
  pillsExpandAll,
  onSetPillsExpandAll,
  onAddRow,
  onAddColumn,
  onAddCard,
  onMerge,
  canMerge,
  onCreateTable,
  canCreateTable,
  onUnmergeRegion,
  onOpenMarkdownHelp,
  onOpenTableVisibility,
  onSaveActiveTableAsTemplate,
  onInsertTableFromTemplate,
}: {
  activeTable: GridTableV1 | null;
  cellSelectionCount: number;
  activeRegionId: string | null;
  onSetHeaderRows: (n: number) => void;
  onSetHeaderCols: (n: number) => void;
  onSetFooterRows: (n: number) => void;
  pillsExpandAll: boolean;
  onSetPillsExpandAll: (v: boolean) => void;
  onAddRow: () => void;
  onAddColumn: () => void;
  onAddCard: () => void;
  onMerge: () => void;
  canMerge: boolean;
  onCreateTable: () => void;
  canCreateTable: boolean;
  onUnmergeRegion: () => void;
  onOpenMarkdownHelp?: () => void;
  onOpenTableVisibility?: (anchorEl: HTMLElement) => void;
  onSaveActiveTableAsTemplate?: () => void;
  onInsertTableFromTemplate?: () => void;
}) {
  return (
    <>
      {/* Top bar: keep table header controls here */}
      <div className="relative z-40 bg-white border-b px-2 min-h-[34px] h-auto flex items-center justify-between gap-2 shadow-sm shrink-0">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          {activeTable ? (
            <div className="ml-2 inline-flex items-center gap-1 text-[11px]">
              <span className="opacity-70">Header rows</span>
              <button type="button" className="mac-btn h-7 w-8 px-0" onClick={() => onSetHeaderRows(activeTable.headerRows - 1)}>
                -
              </button>
              <div className="min-w-[28px] text-center">{activeTable.headerRows}</div>
              <button type="button" className="mac-btn h-7 w-8 px-0" onClick={() => onSetHeaderRows(activeTable.headerRows + 1)}>
                +
              </button>
            </div>
          ) : null}
          {activeTable ? (
            <div className="ml-2 inline-flex items-center gap-1 text-[11px]">
              <span className="opacity-70">Header cols</span>
              <button type="button" className="mac-btn h-7 w-8 px-0" onClick={() => onSetHeaderCols((activeTable.headerCols ?? 0) - 1)}>
                -
              </button>
              <div className="min-w-[28px] text-center">{activeTable.headerCols ?? 0}</div>
              <button type="button" className="mac-btn h-7 w-8 px-0" onClick={() => onSetHeaderCols((activeTable.headerCols ?? 0) + 1)}>
                +
              </button>
            </div>
          ) : null}
          {activeTable ? (
            <div className="ml-2 inline-flex items-center gap-1 text-[11px]">
              <span className="opacity-70">Footer rows</span>
              <button type="button" className="mac-btn h-7 w-8 px-0" onClick={() => onSetFooterRows((activeTable.footerRows ?? 0) - 1)}>
                -
              </button>
              <div className="min-w-[28px] text-center">{activeTable.footerRows ?? 0}</div>
              <button type="button" className="mac-btn h-7 w-8 px-0" onClick={() => onSetFooterRows((activeTable.footerRows ?? 0) + 1)}>
                +
              </button>
            </div>
          ) : null}
          {activeTable ? (
            <label className="ml-3 inline-flex items-center gap-1 text-[11px]">
              <input type="checkbox" checked={pillsExpandAll} onChange={(e) => onSetPillsExpandAll(e.target.checked)} />
              <span className="opacity-70">Expand pills</span>
            </label>
          ) : null}
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <div className="text-[11px] opacity-70">
            {cellSelectionCount > 1 ? `${cellSelectionCount} cell(s) selected` : activeRegionId ? `Region selected: ${activeRegionId}` : ''}
          </div>
          {onSaveActiveTableAsTemplate ? (
            <button type="button" className="mac-btn h-7" onClick={onSaveActiveTableAsTemplate} title="Save this table as a reusable template">
              Save template
            </button>
          ) : null}
          {onInsertTableFromTemplate ? (
            <button type="button" className="mac-btn h-7" onClick={onInsertTableFromTemplate} title="Insert a saved table template">
              Insert template…
            </button>
          ) : null}
          {activeTable && onOpenTableVisibility ? (
            <button
              type="button"
              className="mac-btn h-7"
              onClick={(e) => onOpenTableVisibility(e.currentTarget)}
              title="Hide/show table rows and columns"
            >
              Columns / Rows
            </button>
          ) : null}
        </div>
      </div>

      {/* Actions bar: main actions (sticky while scrolling) */}
      <div className="relative z-40 bg-white border-b px-2 min-h-[34px] h-auto flex items-center gap-2 shadow-sm shrink-0 flex-wrap">
        <button type="button" className="mac-btn h-7" onClick={onAddRow} title="Add a row">
          + Row
        </button>
        <button type="button" className="mac-btn h-7" onClick={onAddColumn} title="Add a column">
          + Col
        </button>
        <button type="button" className="mac-btn h-7" onClick={onAddCard} title="Add a card at the selected cell">
          + Card
        </button>
        <button
          type="button"
          className="mac-btn h-7"
          onClick={onMerge}
          disabled={!canMerge}
          title={!canMerge ? 'Select at least 2 cells first' : 'Merge selected cells (can be irregular)'}
        >
          Merge
        </button>
        <button
          type="button"
          className="mac-btn h-7"
          onClick={onCreateTable}
          disabled={!canCreateTable}
          title={!canCreateTable ? 'Select a rectangular range first' : 'Create a table from selection'}
        >
          Create table
        </button>
        {activeRegionId ? (
          <button type="button" className="mac-btn h-7" onClick={onUnmergeRegion} title="Unmerge active region">
            Unmerge
          </button>
        ) : null}

        <div className="flex-1 min-w-[8px]" />
        {onOpenMarkdownHelp ? (
          <button type="button" className="mac-btn h-7" onClick={onOpenMarkdownHelp} title="Markdown formatting help">
            Formatting
          </button>
        ) : null}
      </div>
    </>
  );
}

