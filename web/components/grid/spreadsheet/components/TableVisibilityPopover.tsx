export function TableVisibilityPopover({
  title,
  kind,
  onChangeKind,
  keyCol,
  keyColOptions,
  onChangeKeyCol,
  diagramFiles,
  diagramFileId,
  onChangeDiagramFileId,
  diagramStatusLabel,
  dataObjectId,
  dataObjectOptions,
  onChangeDataObjectId,
  isLinked,
  canEditLinkedDiagramFile,
  onLink,
  onUnlink,
  onResync,
  cols,
  rows,
  onToggleCol,
  onToggleRow,
  onShowAllCols,
  onHideAllCols,
  onShowAllRows,
  onHideAllRows,
  onClose,
}: {
  title: string;
  kind: 'normal' | 'sourceData' | 'groupingCellValue' | 'groupingHeaderValue';
  onChangeKind: (kind: 'normal' | 'sourceData' | 'groupingCellValue' | 'groupingHeaderValue') => void;
  keyCol?: string;
  keyColOptions?: Array<{ id: string; label: string }>;
  onChangeKeyCol?: (colId: string) => void;
  diagramFiles: Array<{ id: string; name: string; canEdit: boolean }>;
  diagramFileId: string;
  onChangeDiagramFileId: (fileId: string) => void;
  diagramStatusLabel?: string;
  dataObjectId: string;
  dataObjectOptions: Array<{ id: string; name: string }>;
  onChangeDataObjectId: (dataObjectId: string) => void;
  isLinked: boolean;
  canEditLinkedDiagramFile: boolean;
  onLink: () => void;
  onUnlink: () => void;
  onResync: () => void;
  cols: Array<{ id: string; label: string; hidden: boolean }>;
  rows: Array<{ id: string; label: string; hidden: boolean }>;
  onToggleCol: (colId: string) => void;
  onToggleRow: (rowId: string) => void;
  onShowAllCols: () => void;
  onHideAllCols: () => void;
  onShowAllRows: () => void;
  onHideAllRows: () => void;
  onClose: () => void;
}) {
  return (
    <div className="mac-window">
      <div className="mac-titlebar">
        <div className="mac-title">Table visibility</div>
        <div className="flex-1" />
        <button type="button" className="mac-btn h-7" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="p-2 text-[12px] flex flex-col gap-2">
        <div className="text-[11px] opacity-70 truncate" title={title}>
          {title}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="border border-slate-200 rounded bg-white p-2">
            <div className="text-[11px] font-semibold mb-1">Table type</div>
            <select
              className="w-full mac-btn h-7"
              value={kind}
              onMouseDown={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
              onChange={(e) => onChangeKind(e.target.value as any)}
            >
              <option value="normal">Normal table</option>
              <option value="sourceData">Source data</option>
              <option value="groupingCellValue">Grouping — cell as value</option>
              <option value="groupingHeaderValue">Grouping — header as value</option>
            </select>
            <div className="mt-1 text-[10px] opacity-60 leading-snug">
              {kind === 'sourceData'
                ? 'Treat each row as a record. One column is the primary key id.'
                : kind === 'groupingCellValue'
                  ? 'Treat non-empty cells as attribute values (semantic grouping).'
                  : kind === 'groupingHeaderValue'
                    ? 'Treat each cell as an object keyed by its column (and optionally row grouping).'
                    : 'Standard table behavior.'}
            </div>
          </div>
          <div className="border border-slate-200 rounded bg-white p-2">
            <div className="text-[11px] font-semibold mb-1">Source data key column</div>
            {kind === 'sourceData' && keyColOptions && keyColOptions.length && onChangeKeyCol ? (
              <select
                className="w-full mac-btn h-7"
                value={keyCol || ''}
                onMouseDown={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
                onChange={(e) => onChangeKeyCol(e.target.value)}
              >
                {keyColOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            ) : (
              <div className="text-[11px] opacity-60 h-7 flex items-center">—</div>
            )}
            <div className="mt-1 text-[10px] opacity-60 leading-snug">
              {kind === 'sourceData' ? 'Default is the first data column after the header columns.' : 'Only applicable for “Source data”.'}
            </div>
          </div>
        </div>

        <div className="border border-slate-200 rounded bg-white p-2">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[11px] font-semibold">Link to Data Object</div>
            {diagramStatusLabel ? <div className="text-[10px] opacity-60">Diagram: {diagramStatusLabel}</div> : null}
          </div>

          <div className="mt-2 grid grid-cols-2 gap-2">
            <div>
              <div className="text-[10px] opacity-70 mb-1">Diagram file</div>
              <select
                className="w-full mac-btn h-7"
                value={diagramFileId}
                onMouseDown={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
                onChange={(e) => onChangeDiagramFileId(e.target.value)}
              >
                {diagramFiles.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
              {!canEditLinkedDiagramFile ? (
                <div className="mt-1 text-[10px] text-amber-700">
                  Read-only access. Linking is allowed, but edits from the table won’t sync back.
                </div>
              ) : null}
            </div>

            <div>
              <div className="text-[10px] opacity-70 mb-1">Data object</div>
              <select
                className="w-full mac-btn h-7"
                value={dataObjectId}
                onMouseDown={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
                onChange={(e) => onChangeDataObjectId(e.target.value)}
              >
                <option value="">Select…</option>
                {dataObjectOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name} ({o.id})
                  </option>
                ))}
              </select>
              {diagramFileId && dataObjectOptions.length === 0 ? (
                <div className="mt-1 text-[10px] opacity-60">No data objects found in this file (or still loading).</div>
              ) : null}
            </div>
          </div>

          <div className="mt-2 flex items-center gap-2">
            <button type="button" className="mac-btn mac-btn--primary h-7" onClick={onLink} disabled={!diagramFileId || !dataObjectId}>
              {isLinked ? 'Relink' : 'Link'}
            </button>
            <button type="button" className="mac-btn h-7" onClick={onResync} disabled={!isLinked}>
              Re-sync
            </button>
            <div className="flex-1" />
            <button type="button" className="mac-btn h-7" onClick={onUnlink} disabled={!isLinked}>
              Unlink
            </button>
          </div>

          <div className="mt-1 text-[10px] opacity-60 leading-snug">
            Linking turns this into Source data and generates columns from the Data Object’s attributes.
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="border border-slate-200 rounded overflow-hidden bg-white">
            <div className="px-2 py-1 border-b border-slate-200 flex items-center justify-between gap-2">
              <div className="text-[11px] font-semibold">Columns</div>
              <div className="flex items-center gap-1">
                <button type="button" className="mac-btn h-6" onClick={onShowAllCols}>
                  Show all
                </button>
                <button type="button" className="mac-btn h-6" onClick={onHideAllCols}>
                  Hide all
                </button>
              </div>
            </div>
            <div className="max-h-[260px] overflow-auto p-1">
              {cols.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className="w-full text-left px-1.5 py-1 rounded hover:bg-slate-50 flex items-center gap-2"
                  onClick={() => onToggleCol(c.id)}
                >
                  <span
                    className={`inline-flex items-center justify-center w-4 h-4 rounded border ${
                      c.hidden ? 'bg-white border-slate-300' : 'bg-slate-900 text-white border-slate-900'
                    }`}
                  >
                    {c.hidden ? '' : '✓'}
                  </span>
                  <span className="flex-1 min-w-0 truncate">{c.label}</span>
                </button>
              ))}
              {cols.length === 0 ? <div className="px-2 py-2 text-[11px] opacity-60">No data columns.</div> : null}
            </div>
          </div>

          <div className="border border-slate-200 rounded overflow-hidden bg-white">
            <div className="px-2 py-1 border-b border-slate-200 flex items-center justify-between gap-2">
              <div className="text-[11px] font-semibold">Rows</div>
              <div className="flex items-center gap-1">
                <button type="button" className="mac-btn h-6" onClick={onShowAllRows}>
                  Show all
                </button>
                <button type="button" className="mac-btn h-6" onClick={onHideAllRows}>
                  Hide all
                </button>
              </div>
            </div>
            <div className="max-h-[260px] overflow-auto p-1">
              {rows.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className="w-full text-left px-1.5 py-1 rounded hover:bg-slate-50 flex items-center gap-2"
                  onClick={() => onToggleRow(r.id)}
                >
                  <span
                    className={`inline-flex items-center justify-center w-4 h-4 rounded border ${
                      r.hidden ? 'bg-white border-slate-300' : 'bg-slate-900 text-white border-slate-900'
                    }`}
                  >
                    {r.hidden ? '' : '✓'}
                  </span>
                  <span className="flex-1 min-w-0 truncate">{r.label}</span>
                </button>
              ))}
              {rows.length === 0 ? <div className="px-2 py-2 text-[11px] opacity-60">No data rows.</div> : null}
            </div>
          </div>
        </div>

        <div className="text-[10px] opacity-60">
          Note: this hides rows/columns <span className="font-semibold">within the table view</span> only (it won’t delete sheet rows/columns).
        </div>
      </div>
    </div>
  );
}

