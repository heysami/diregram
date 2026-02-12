import * as Y from 'yjs';
import type { FlowNode } from '@/components/DimensionFlowEditor';

export type FlowId = string;

export interface NexusFlowIndexEntry {
  id: FlowId;
  name: string;
  createdAt: number;
}

export interface NexusFlowsIndex {
  nextId: number;
  flows: NexusFlowIndexEntry[];
}

export interface StageDef {
  id: string;
  label: string;
}

export interface RowDef {
  id: string;
  label: string;
}

export interface NexusFlowData {
  id: FlowId;
  name: string;
  // Swimlane semantics
  lanes: RowDef[];
  stages: StageDef[];
  // Flow editor payload (reuses the process-node flow model)
  nodes: FlowNode[];
  edges: Record<string, { label: string; color: string }>;
  // Persist lane labels used by DimensionFlowEditor (kept in sync with `lanes`)
  branches: RowDef[];
}

const INDEX_BLOCK_TYPE = 'nexus-flows';
const flowBlockType = (flowId: FlowId) => `nexus-flow-${flowId}`;

function findBlock(text: string, blockType: string): RegExpMatchArray | null {
  // Match a fenced code block:
  // ```{blockType}
  // {json}
  // ```
  return text.match(new RegExp(`\`\`\`${blockType}\\n([\\s\\S]*?)\\n\`\`\``));
}

function upsertBlock(text: string, blockType: string, json: unknown): string {
  const storageBlock = `\`\`\`${blockType}\n${JSON.stringify(json, null, 2)}\n\`\`\``;
  const existing = text.match(new RegExp(`\`\`\`${blockType}\\n[\\s\\S]*?\\n\`\`\``));
  if (existing) {
    return text.replace(new RegExp(`\`\`\`${blockType}\\n[\\s\\S]*?\\n\`\`\``), storageBlock);
  }
  const separatorIndex = text.indexOf('\n---\n');
  if (separatorIndex !== -1) {
    return text.slice(0, separatorIndex) + '\n' + storageBlock + '\n' + text.slice(separatorIndex);
  }
  return text + (text.endsWith('\n') ? '' : '\n') + '\n' + storageBlock;
}

export function loadFlowsIndex(doc: Y.Doc): NexusFlowsIndex {
  const yText = doc.getText('nexus');
  const currentText = yText.toString();
  const match = findBlock(currentText, INDEX_BLOCK_TYPE);
  if (match) {
    try {
      const parsed = JSON.parse(match[1]);
      return {
        nextId: parsed.nextId || 1,
        flows: Array.isArray(parsed.flows) ? parsed.flows : [],
      };
    } catch (e) {
      console.error('Failed to parse flows index:', e);
    }
  }
  return { nextId: 1, flows: [] };
}

export function saveFlowsIndex(doc: Y.Doc, index: NexusFlowsIndex): void {
  const yText = doc.getText('nexus');
  const currentText = yText.toString();
  const newText = upsertBlock(currentText, INDEX_BLOCK_TYPE, index);
  if (newText === currentText) return;
  doc.transact(() => {
    yText.delete(0, yText.length);
    yText.insert(0, newText);
  });
}

export function loadFlow(doc: Y.Doc, flowId: FlowId): NexusFlowData | null {
  const yText = doc.getText('nexus');
  const currentText = yText.toString();
  const match = findBlock(currentText, flowBlockType(flowId));
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1]);
    return {
      id: parsed.id || flowId,
      name: parsed.name || 'Untitled Flow',
      lanes: Array.isArray(parsed.lanes) ? parsed.lanes : [],
      stages: Array.isArray(parsed.stages) ? parsed.stages : [],
      nodes: Array.isArray(parsed.nodes) ? parsed.nodes : [],
      edges: parsed.edges || {},
      branches: Array.isArray(parsed.branches) ? parsed.branches : [],
    };
  } catch (e) {
    console.error('Failed to parse flow data:', e);
    return null;
  }
}

export function saveFlow(doc: Y.Doc, flow: NexusFlowData): void {
  const yText = doc.getText('nexus');
  const currentText = yText.toString();
  const newText = upsertBlock(currentText, flowBlockType(flow.id), flow);
  if (newText === currentText) return;
  doc.transact(() => {
    yText.delete(0, yText.length);
    yText.insert(0, newText);
  });
}

export function buildDefaultFlow(id: FlowId, name: string): NexusFlowData {
  const lanes: RowDef[] = [{ id: 'branch-1', label: 'Lane 1' }];
  const stages: StageDef[] = [{ id: 'stage-1', label: 'Stage 1' }];
  const nodes: FlowNode[] = [{ id: 'flow-1', label: 'Step 1', type: 'step', branchId: 'branch-1' }];
  return {
    id,
    name,
    lanes,
    stages,
    nodes,
    edges: {},
    branches: [...lanes],
  };
}

export function createFlow(doc: Y.Doc, name: string): NexusFlowData {
  const yText = doc.getText('nexus');
  const currentText = yText.toString();
  const index = loadFlowsIndex(doc);
  const id: FlowId = `flowdoc-${index.nextId}`;
  const entry: NexusFlowIndexEntry = {
    id,
    name: name.trim() || `Flow ${index.nextId}`,
    createdAt: Date.now(),
  };
  const nextIndex: NexusFlowsIndex = {
    nextId: index.nextId + 1,
    flows: [...index.flows, entry],
  };
  const flow = buildDefaultFlow(id, entry.name);

  const nextText = upsertBlock(upsertBlock(currentText, INDEX_BLOCK_TYPE, nextIndex), flowBlockType(id), flow);
  if (nextText !== currentText) {
    doc.transact(() => {
      yText.delete(0, yText.length);
      yText.insert(0, nextText);
    });
  }
  return flow;
}

