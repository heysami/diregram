import { useMemo, useRef, useState } from 'react';
import * as Y from 'yjs';
import { DimensionTableEditor, type TableColumn, type TableRow, type MergedCell } from '@/components/DimensionTableEditor';
import { NexusCanvas } from '@/components/NexusCanvas';
import { parseNexusMarkdown } from '@/lib/nexus-parser';
import { buildProcessRunningNumberMap } from '@/lib/process-running-number-map';
import { parseTableFromMarkdown, serializeTableToMarkdown } from '@/lib/table-serialization';
import {
  parseDataObjectAttributeDescriptions,
  upsertDataObjectAttributeDescription,
  type DataObjectAttributeDescriptionMode,
} from '@/lib/data-object-attribute-descriptions';
import { X } from 'lucide-react';

export type DoAttrDescTarget = {
  doId: string;
  doName: string;
  attrId: string;
  attrName: string;
  values: string[];
};

/**
 * Reusable modal controller for Data Object Attribute Descriptions.
 *
 * Why this exists:
 * - Both the Data Object inspector and Conditional Logic panel need to open the exact same
 *   Flow/Table descriptions for a status attribute (shared persistence).
 * - Keeping this logic centralized avoids future regressions when either UI changes.
 */
export function useDataObjectAttributeDescriptionModals(opts: { doc: Y.Doc }) {
  const { doc } = opts;

  const [target, setTarget] = useState<DoAttrDescTarget | null>(null);
  const [showTable, setShowTable] = useState(false);
  const [showFlow, setShowFlow] = useState(false);

  // Table editor state
  const [tableColumns, setTableColumns] = useState<TableColumn[] | null>(null);
  const [tableRows, setTableRows] = useState<TableRow[] | null>(null);
  const [tableMergedCells, setTableMergedCells] = useState<Map<string, MergedCell> | null>(null);

  // Flow editor state (Flow tab style: Nexus markdown in a local Y.Doc)
  const [flowDoc, setFlowDoc] = useState<Y.Doc | null>(null);
  const flowDocRef = useRef<Y.Doc | null>(null);
  const [flowSelectedNodeId, setFlowSelectedNodeId] = useState<string | null>(null);
  const [flowExpandedNodes, setFlowExpandedNodes] = useState<Set<string>>(() => new Set());
  const [flowProcessFlowModeNodes, setFlowProcessFlowModeNodes] = useState<Set<string>>(() => new Set());
  const [flowFocusTick, setFlowFocusTick] = useState(0);
  const flowProcessRnCacheRef = useRef<{ markdown: string; map: Map<string, number> } | null>(null);

  const getFlowProcessRunningNumber = (nodeId: string): number | undefined => {
    const d = flowDocRef.current;
    if (!d) return undefined;
    const markdown = d.getText('nexus').toString();
    const cache = flowProcessRnCacheRef.current;
    if (cache && cache.markdown === markdown) return cache.map.get(nodeId);
    const roots = parseNexusMarkdown(markdown);
    const map = buildProcessRunningNumberMap({ doc: d, roots });
    flowProcessRnCacheRef.current = { markdown, map };
    return map.get(nodeId);
  };

  const open = (nextTarget: DoAttrDescTarget, mode: DataObjectAttributeDescriptionMode) => {
    setTarget(nextTarget);
    const yText = doc.getText('nexus');
    const current = yText.toString();
    const { blocks } = parseDataObjectAttributeDescriptions(current);
    const blockId = `${nextTarget.doId}::${nextTarget.attrId}`;
    const found = blocks.find((b) => b.id === blockId && b.mode === mode) || null;

    if (mode === 'table') {
      if (found?.bodyLines?.length) {
        const parsed = parseTableFromMarkdown(found.bodyLines);
        if (parsed) {
          setTableColumns(parsed.columns);
          setTableRows(parsed.rows);
          setTableMergedCells(parsed.mergedCells);
        } else {
          setTableColumns(null);
          setTableRows(null);
          setTableMergedCells(null);
        }
      } else {
        setTableColumns(null);
        setTableRows(null);
        setTableMergedCells(null);
      }
      setShowTable(true);
      return;
    }

    const bodyLines = found?.bodyLines || [];
    const initialLines =
      bodyLines.length > 0
        ? bodyLines
        : [`${nextTarget.doName} – ${nextTarget.attrName} #flow#`, `  Step 1 #flow#`, `  Step 2 #flow#`];

    const nextDoc = new Y.Doc();
    nextDoc.getText('nexus').insert(0, initialLines.join('\n').trimEnd() + '\n');
    const roots = parseNexusMarkdown(nextDoc.getText('nexus').toString());
    const rootId = roots[0]?.id || 'node-0';

    flowDocRef.current = nextDoc;
    flowProcessRnCacheRef.current = null;
    setFlowDoc(nextDoc);
    setFlowSelectedNodeId(null);
    setFlowExpandedNodes(new Set());
    setFlowProcessFlowModeNodes(new Set([rootId]));
    setFlowFocusTick((t) => t + 1);
    setShowFlow(true);
  };

  const closeTable = () => {
    setShowTable(false);
    setTarget(null);
    setTableColumns(null);
    setTableRows(null);
    setTableMergedCells(null);
  };

  const closeFlow = () => {
    setShowFlow(false);
    setTarget(null);
    flowDocRef.current = null;
    flowProcessRnCacheRef.current = null;
    setFlowDoc(null);
    setFlowSelectedNodeId(null);
    setFlowExpandedNodes(new Set());
    setFlowProcessFlowModeNodes(new Set());
  };

  const save = (mode: DataObjectAttributeDescriptionMode) => {
    if (!target) return;
    const yText = doc.getText('nexus');
    const current = yText.toString();
    const id = `${target.doId}::${target.attrId}`;
    const label = `${target.doName} – ${target.attrName}`;

    let bodyLines: string[] = [];
    if (mode === 'table') {
      bodyLines =
        tableColumns && tableRows
          ? serializeTableToMarkdown(tableColumns, tableRows, tableMergedCells, target.values || [])
          : [];
    } else {
      const ensureFlowTag = (line: string): string => {
        const raw = line ?? '';
        if (!raw.trim()) return raw;
        if (raw.includes('#flow#')) return raw;
        const commentIdx = raw.indexOf('<!--');
        if (commentIdx >= 0) {
          return raw.slice(0, commentIdx).trimEnd() + ' #flow# ' + raw.slice(commentIdx).trimStart();
        }
        return raw.trimEnd() + ' #flow#';
      };
      const flowText = flowDocRef.current?.getText('nexus')?.toString?.() ?? '';
      const rawLines = flowText.split('\n');
      while (rawLines.length > 0 && !rawLines[rawLines.length - 1].trim()) rawLines.pop();
      bodyLines = rawLines.map(ensureFlowTag).filter((l) => l.trim().length > 0);
    }

    const next = upsertDataObjectAttributeDescription(current, { id, label, mode, bodyLines });
    if (next !== current) {
      doc.transact(() => {
        yText.delete(0, yText.length);
        yText.insert(0, next);
      });
    }

    if (mode === 'table') closeTable();
    else closeFlow();
  };

  const modals = useMemo(() => {
    if (!target) return null;

    return (
      <>
        {showTable ? (
          <div className="fixed inset-0 z-[70] bg-black/40 flex items-center justify-center">
            <div className="mac-window max-w-4xl w-[92vw] max-h-[90vh] flex flex-col">
              <div className="mac-titlebar">
                <div className="mac-title">Status Table Description</div>
                <div className="absolute right-1 top-1/2 -translate-y-1/2">
                  <button type="button" onClick={closeTable} className="mac-btn" title="Close">
                    <X size={14} />
                  </button>
                </div>
              </div>
              <div className="px-4 py-2 border-b">
                <div className="text-[12px] font-bold truncate">
                  {target.doName} – {target.attrName}
                </div>
              </div>
              <div className="p-4 overflow-auto flex-1">
                <DimensionTableEditor
                  initialColumns={tableColumns || undefined}
                  initialRows={tableRows || undefined}
                  dimensionValues={target.values || []}
                  onChange={(cols, rows, mergedCells) => {
                    setTableColumns(cols);
                    setTableRows(rows);
                    setTableMergedCells(mergedCells || null);
                  }}
                />
              </div>
              <div className="border-t px-4 py-3 flex items-center justify-end gap-2">
                <button type="button" onClick={closeTable} className="mac-btn">
                  Cancel
                </button>
                <button type="button" onClick={() => save('table')} className="mac-btn mac-btn--primary">
                  Save to Markdown
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {showFlow ? (
          <div className="fixed inset-0 z-[70] bg-black/40 flex items-center justify-center">
            <div className="mac-window max-w-6xl w-[94vw] max-h-[92vh] flex flex-col">
              <div className="mac-titlebar">
                <div className="mac-title">Status Flow Description</div>
                <div className="absolute right-1 top-1/2 -translate-y-1/2">
                  <button type="button" onClick={closeFlow} className="mac-btn" title="Close">
                    <X size={14} />
                  </button>
                </div>
              </div>
              <div className="px-4 py-2 border-b">
                <div className="text-[12px] font-bold truncate">
                  {target.doName} – {target.attrName}
                </div>
              </div>
              <div className="p-4 overflow-auto flex-1">
                {flowDoc ? (
                  <div className="relative h-[70vh] min-h-[520px] border border-slate-200 rounded-md overflow-hidden bg-white">
                    <NexusCanvas
                      doc={flowDoc}
                      activeTool="select"
                      onToolUse={() => {}}
                      showComments={false}
                      showAnnotations={false}
                      initialFitToContent
                      activeVariantState={{}}
                      onActiveVariantChange={() => {}}
                      selectedNodeId={flowSelectedNodeId}
                      onSelectNode={setFlowSelectedNodeId}
                      expandedNodes={flowExpandedNodes}
                      onExpandedNodesChange={setFlowExpandedNodes}
                      processFlowModeNodes={flowProcessFlowModeNodes}
                      onProcessFlowModeNodesChange={setFlowProcessFlowModeNodes}
                      hideShowFlowToggle
                      focusTick={flowFocusTick}
                      getRunningNumber={() => undefined}
                      getProcessRunningNumber={getFlowProcessRunningNumber}
                      textAutocompleteOptions={target.values || []}
                      linkedTextOptions={target.values || []}
                    />
                  </div>
                ) : null}
              </div>
              <div className="border-t px-4 py-3 flex items-center justify-end gap-2">
                <button type="button" onClick={closeFlow} className="mac-btn">
                  Cancel
                </button>
                <button type="button" onClick={() => save('flow')} className="mac-btn mac-btn--primary">
                  Save to Markdown
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </>
    );
  }, [
    target,
    showTable,
    showFlow,
    tableColumns,
    tableRows,
    tableMergedCells,
    flowDoc,
    flowSelectedNodeId,
    flowExpandedNodes,
    flowProcessFlowModeNodes,
    flowFocusTick,
  ]);

  return {
    openTable: (t: DoAttrDescTarget) => open(t, 'table'),
    openFlow: (t: DoAttrDescTarget) => open(t, 'flow'),
    modals,
  };
}

