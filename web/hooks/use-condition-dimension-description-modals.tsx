import { useMemo, useRef, useState } from 'react';
import * as Y from 'yjs';
import { X } from 'lucide-react';
import type { NexusNode } from '@/types/nexus';
import { DimensionTableEditor, type TableColumn, type TableRow, type MergedCell } from '@/components/DimensionTableEditor';
import { NexusCanvas } from '@/components/NexusCanvas';
import { parseNexusMarkdown } from '@/lib/nexus-parser';
import { buildProcessRunningNumberMap } from '@/lib/process-running-number-map';
import { parseTableFromMarkdown, serializeTableToMarkdown } from '@/lib/table-serialization';
import {
  parseDimensionDescriptions,
  upsertDimensionDescription,
  type DimensionDescriptionMode,
} from '@/lib/dimension-descriptions';
import { loadDimensionDescriptions, type DimensionDescriptionEntry } from '@/lib/dimension-description-storage';
import { matchNodeToDimensionDescription } from '@/lib/dimension-description-matcher';

type Mode = DimensionDescriptionMode; // 'table' | 'flow'

/**
 * Conditional node: per-dimension Table/Flow description modals.
 *
 * Centralizes:
 * - parsing existing descriptions (by running number)
 * - editing UI (table editor + Flow-tab NexusCanvas)
 * - persistence back to markdown + `dimension-descriptions` storage block
 * - maintaining `<!-- desc:... -->` comments on node lines
 */
export function useConditionDimensionDescriptionModals(opts: {
  doc: Y.Doc;
  node: NexusNode;
  nodeMap: Map<string, NexusNode>;
  effectiveKeyValues: Map<string, string[]>;
}) {
  const { doc, node, nodeMap, effectiveKeyValues } = opts;

  const TABLE_MODE: Mode = 'table';
  const FLOW_MODE: Mode = 'flow';

  const dimensionDescriptionRunningNumberMapRef = useRef<Map<string, number>>(new Map());

  const [dimensionKey, setDimensionKey] = useState<string | null>(null);
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

  const resolveRunningNumber = (mode: Mode, key: string, current: string) => {
    const descData = loadDimensionDescriptions(doc);
    const cacheKey = `${node.id}::${key}::${mode}`;
    let rn = dimensionDescriptionRunningNumberMapRef.current.get(cacheKey);
    if (rn) return { rn, descData };

    const match = matchNodeToDimensionDescription(node, key, mode, current, descData.entries, nodeMap);
    if (match) {
      rn = match.runningNumber;
    } else {
      rn = descData.nextRunningNumber;
      descData.nextRunningNumber = rn + 1;
    }
    dimensionDescriptionRunningNumberMapRef.current.set(cacheKey, rn);
    return { rn, descData };
  };

  const openTable = (key: string) => {
    const yText = doc.getText('nexus');
    const currentText = yText.toString();

    const { rn } = resolveRunningNumber(TABLE_MODE, key, currentText);
    const { blocks } = parseDimensionDescriptions(currentText);
    const block =
      blocks.find((b) => b.runningNumber === rn && b.mode === TABLE_MODE) ||
      blocks.find((b) => b.id === `${node.id}::${key}` && b.mode === TABLE_MODE);

    if (block && block.bodyLines.length > 0) {
      const parsed = parseTableFromMarkdown(block.bodyLines);
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

    setDimensionKey(key);
    setShowTable(true);
  };

  const openFlow = (key: string) => {
    const yText = doc.getText('nexus');
    const currentText = yText.toString();

    const { rn } = resolveRunningNumber(FLOW_MODE, key, currentText);
    const { blocks } = parseDimensionDescriptions(currentText);
    const block =
      blocks.find((b) => b.runningNumber === rn && b.mode === FLOW_MODE) ||
      blocks.find((b) => b.id === `${node.id}::${key}` && b.mode === FLOW_MODE);

    const bodyLines = block?.bodyLines || [];
    const looksLikeOldFlowJson = bodyLines.some((l) => l.trim() === '```flowjson');
    const initialLines =
      bodyLines.length > 0 && !looksLikeOldFlowJson
        ? bodyLines
        : [`${node.content} – ${key} #flow#`, `  Step 1 #flow#`, `  Step 2 #flow#`];

    const nextDoc = new Y.Doc();
    const localText = nextDoc.getText('nexus');
    const normalized = initialLines.join('\n').trimEnd() + '\n';
    localText.insert(0, normalized);

    const parsedRoots = parseNexusMarkdown(normalized);
    const rootId = parsedRoots[0]?.id || 'node-0';

    flowDocRef.current = nextDoc;
    flowProcessRnCacheRef.current = null;
    setFlowDoc(nextDoc);
    setFlowSelectedNodeId(null);
    setFlowExpandedNodes(new Set());
    setFlowProcessFlowModeNodes(new Set([rootId]));
    setFlowFocusTick((t) => t + 1);

    setDimensionKey(key);
    setShowFlow(true);
  };

  const closeTable = () => {
    setShowTable(false);
    setDimensionKey(null);
    setTableColumns(null);
    setTableRows(null);
    setTableMergedCells(null);
  };

  const closeFlow = () => {
    setShowFlow(false);
    setDimensionKey(null);
    flowDocRef.current = null;
    flowProcessRnCacheRef.current = null;
    setFlowDoc(null);
    setFlowSelectedNodeId(null);
    setFlowExpandedNodes(new Set());
    setFlowProcessFlowModeNodes(new Set());
  };

  const persistStorageAndComments = (updatedWithDesc: string, descData: ReturnType<typeof loadDimensionDescriptions>) => {
    // Add desc comments to node lines
    const lines = updatedWithDesc.split('\n');
    const lineToDescriptions = new Map<number, Array<{ mode: Mode; dimensionKey: string; runningNumber: number }>>();
    descData.entries.forEach((e) => {
      if (!lineToDescriptions.has(e.lineIndex)) lineToDescriptions.set(e.lineIndex, []);
      lineToDescriptions.get(e.lineIndex)!.push({
        mode: e.mode,
        dimensionKey: e.dimensionKey,
        runningNumber: e.runningNumber,
      });
    });

    const annotatedLines = lines.map((line, index) => {
      let cleaned = line.replace(/<!--\s*desc:[^>]*\s*-->/, '').trimEnd();
      const descriptions = lineToDescriptions.get(index);
      if (descriptions && descriptions.length > 0) {
        const descParts = descriptions.map((d) => `${d.mode}:${d.dimensionKey}:${d.runningNumber}`).join(',');
        cleaned = cleaned + ` <!-- desc:${descParts} -->`;
      }
      return cleaned;
    });
    let out = annotatedLines.join('\n');

    // Update/inject storage block
    const storageBlock = `\`\`\`dimension-descriptions\n${JSON.stringify(descData, null, 2)}\n\`\`\``;
    const existingMatch = out.match(/```dimension-descriptions\n[\s\S]*?\n```/);
    if (existingMatch) {
      out = out.replace(/```dimension-descriptions\n[\s\S]*?\n```/, storageBlock);
    } else {
      const separatorIndex = out.indexOf('\n---\n');
      if (separatorIndex !== -1) {
        out = out.slice(0, separatorIndex) + '\n' + storageBlock + '\n' + out.slice(separatorIndex);
      } else {
        out = out + (out.endsWith('\n') ? '' : '\n') + '\n' + storageBlock;
      }
    }

    return out;
  };

  const saveTable = () => {
    if (!dimensionKey) return;
    const yText = doc.getText('nexus');
    const current = yText.toString();

    const { rn: runningNumber, descData } = resolveRunningNumber(TABLE_MODE, dimensionKey, current);

    const entry: DimensionDescriptionEntry = {
      runningNumber,
      content: node.content,
      parentPath: [],
      lineIndex: node.lineIndex,
      dimensionKey,
      mode: TABLE_MODE,
    };

    // Compute parent path for matching.
    const parentPath: string[] = [];
    let currentParent = nodeMap.get(node.parentId || '');
    while (currentParent) {
      parentPath.unshift(currentParent.content);
      currentParent = currentParent.parentId ? nodeMap.get(currentParent.parentId) : undefined;
    }
    entry.parentPath = parentPath;

    const existingIndex = descData.entries.findIndex((e) => e.runningNumber === runningNumber);
    if (existingIndex >= 0) descData.entries[existingIndex] = entry;
    else descData.entries.push(entry);

    const dimensionValues = effectiveKeyValues.get(dimensionKey) || [];
    const bodyLines =
      tableColumns && tableRows ? serializeTableToMarkdown(tableColumns, tableRows, tableMergedCells, dimensionValues) : [];

    let updatedWithDesc = upsertDimensionDescription(current, {
      id: `${node.id}::${dimensionKey}`,
      runningNumber,
      hubLabel: `${node.content} – ${dimensionKey}`,
      mode: TABLE_MODE,
      bodyLines,
    });

    updatedWithDesc = persistStorageAndComments(updatedWithDesc, descData);
    if (updatedWithDesc !== current) {
      doc.transact(() => {
        yText.delete(0, yText.length);
        yText.insert(0, updatedWithDesc);
      });
    }
    closeTable();
  };

  const saveFlow = () => {
    if (!dimensionKey) return;
    const yText = doc.getText('nexus');
    const current = yText.toString();

    const { rn: runningNumber, descData } = resolveRunningNumber(FLOW_MODE, dimensionKey, current);

    const entry: DimensionDescriptionEntry = {
      runningNumber,
      content: node.content,
      parentPath: [],
      lineIndex: node.lineIndex,
      dimensionKey,
      mode: FLOW_MODE,
    };

    const parentPath: string[] = [];
    let currentParent = nodeMap.get(node.parentId || '');
    while (currentParent) {
      parentPath.unshift(currentParent.content);
      currentParent = currentParent.parentId ? nodeMap.get(currentParent.parentId) : undefined;
    }
    entry.parentPath = parentPath;

    const existingIndex = descData.entries.findIndex((e) => e.runningNumber === runningNumber);
    if (existingIndex >= 0) descData.entries[existingIndex] = entry;
    else descData.entries.push(entry);

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
    const bodyLines = rawLines.map(ensureFlowTag).filter((l) => l.trim().length > 0);

    let updatedWithDesc = upsertDimensionDescription(current, {
      id: `${node.id}::${dimensionKey}`,
      runningNumber,
      hubLabel: `${node.content} – ${dimensionKey}`,
      mode: FLOW_MODE,
      bodyLines,
    });

    updatedWithDesc = persistStorageAndComments(updatedWithDesc, descData);
    if (updatedWithDesc !== current) {
      doc.transact(() => {
        yText.delete(0, yText.length);
        yText.insert(0, updatedWithDesc);
      });
    }
    closeFlow();
  };

  const valuesForKey = useMemo(() => {
    if (!dimensionKey) return [];
    return effectiveKeyValues.get(dimensionKey) || [];
  }, [dimensionKey, effectiveKeyValues]);

  const modals = useMemo(() => {
    if (!dimensionKey) return null;
    return (
      <>
        {showTable ? (
          <div className="fixed inset-0 z-[70] bg-black/40 flex items-center justify-center">
            <div className="mac-window max-w-4xl w-[92vw] max-h-[90vh] flex flex-col">
              <div className="mac-titlebar">
                <div className="mac-title">Table Description</div>
                <div className="absolute right-1 top-1/2 -translate-y-1/2">
                  <button type="button" onClick={closeTable} className="mac-btn" title="Close">
                    <X size={14} />
                  </button>
                </div>
              </div>
              <div className="px-4 py-2 border-b">
                <div className="text-[12px] font-bold truncate">
                  {node.content} – {dimensionKey}
                </div>
              </div>
              <div className="p-4 overflow-auto flex-1">
                <DimensionTableEditor
                  initialColumns={tableColumns || undefined}
                  initialRows={tableRows || undefined}
                  dimensionValues={valuesForKey}
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
                <button type="button" onClick={saveTable} className="mac-btn mac-btn--primary">
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
                <div className="mac-title">Flow Description</div>
                <div className="absolute right-1 top-1/2 -translate-y-1/2">
                  <button type="button" onClick={closeFlow} className="mac-btn" title="Close">
                    <X size={14} />
                  </button>
                </div>
              </div>
              <div className="px-4 py-2 border-b">
                <div className="text-[12px] font-bold truncate">
                  {node.content} – {dimensionKey}
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
                      textAutocompleteOptions={valuesForKey}
                      linkedTextOptions={valuesForKey}
                    />
                  </div>
                ) : null}
              </div>
              <div className="border-t px-4 py-3 flex items-center justify-end gap-2">
                <button type="button" onClick={closeFlow} className="mac-btn">
                  Cancel
                </button>
                <button type="button" onClick={saveFlow} className="mac-btn mac-btn--primary">
                  Save to Markdown
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </>
    );
  }, [
    dimensionKey,
    showTable,
    showFlow,
    node.content,
    flowDoc,
    flowSelectedNodeId,
    flowExpandedNodes,
    flowProcessFlowModeNodes,
    flowFocusTick,
    tableColumns,
    tableRows,
    tableMergedCells,
    valuesForKey,
  ]);

  return {
    openTable,
    openFlow,
    modals,
  };
}

