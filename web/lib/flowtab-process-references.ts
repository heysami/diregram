import * as Y from 'yjs';

export type FlowTabProcessReference =
  | {
      kind: 'whole';
      /** Process root node id selected in the picker */
      rootProcessNodeId: string;
      /** For whole, this will equal rootProcessNodeId */
      targetNodeId: string;
      /** Stable anchor for rootProcessNodeId (preferred for resolution). */
      rootProcessRunningNumber?: number;
    }
  | {
      kind: 'inner';
      rootProcessNodeId: string;
      /** Specific node inside the selected root */
      targetNodeId: string;
      /** Stable anchors for resolution when node ids shift. */
      rootProcessRunningNumber?: number;
      targetRunningNumber?: number;
      /** Expanded running number for the target node once expanded */
      expandedRunningNumber?: number;
      /** Expanded grid node key created for this reference */
      gridNodeKey?: string;
    };

export type FlowTabProcessReferenceMap = Record<string, FlowTabProcessReference>;

const BLOCK_TYPE = 'flowtab-process-references';

function findBlock(text: string): RegExpMatchArray | null {
  return text.match(new RegExp(`\\\`\\\`\\\`${BLOCK_TYPE}\\n([\\s\\S]*?)\\n\\\`\\\`\\\``));
}

function upsertBlock(text: string, json: unknown): string {
  const dataBlock = `\`\`\`${BLOCK_TYPE}\n${JSON.stringify(json, null, 2)}\n\`\`\``;
  const re = new RegExp(`\\\`\\\`\\\`${BLOCK_TYPE}\\n[\\s\\S]*?\\n\\\`\\\`\\\``);
  if (re.test(text)) return text.replace(re, dataBlock);

  const separatorIndex = text.indexOf('\n---\n');
  if (separatorIndex !== -1) {
    return text.slice(0, separatorIndex + 5) + '\n' + dataBlock + text.slice(separatorIndex + 5);
  }
  return text + (text.endsWith('\n') ? '' : '\n') + '\n---\n' + dataBlock;
}

export function loadFlowTabProcessReferences(doc: Y.Doc): FlowTabProcessReferenceMap {
  const yText = doc.getText('nexus');
  const text = yText.toString();
  const match = findBlock(text);
  if (!match) return {};
  try {
    const parsed = JSON.parse(match[1]);
    return (parsed && typeof parsed === 'object' ? parsed : {}) as FlowTabProcessReferenceMap;
  } catch {
    return {};
  }
}

export function saveFlowTabProcessReferences(doc: Y.Doc, refs: FlowTabProcessReferenceMap): void {
  const yText = doc.getText('nexus');
  const current = yText.toString();
  const next = upsertBlock(current, refs);
  if (next === current) return;
  doc.transact(() => {
    yText.delete(0, yText.length);
    yText.insert(0, next);
  });
}

