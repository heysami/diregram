import type { FlowBuildResult, FlowEdge, FlowNode, NodeLine } from './types';
import { nodeIdForLineIndex } from './markdown';
import { normalizeNewlines, safeSingleLine, stripMermaidComments } from './text';

export function parseFlowchartToken(rawToken: string): FlowNode {
  const token0 = safeSingleLine(rawToken).replace(/:::.*$/, '').trim();

  const isEndLabel = (s: string) => {
    const t = safeSingleLine(s).toLowerCase();
    return t === 'end' || t === 'stop' || t === 'finish' || t === 'done';
  };

  const take = (id: string, label: string, validation?: boolean): FlowNode => {
    const sid = safeSingleLine(id);
    const lab = safeSingleLine(label) || sid;
    return {
      id: sid,
      label: lab,
      ...(validation ? { validation: true } : null),
      ...(isEndLabel(lab) || isEndLabel(sid) ? { end: true } : null),
    };
  };

  let m = token0.match(/^([A-Za-z0-9_.$-]+)\s*\[\s*([\s\S]*?)\s*\]$/);
  if (m) return take(m[1], m[2], false);

  m = token0.match(/^([A-Za-z0-9_.$-]+)\s*\{\s*([\s\S]*?)\s*\}$/);
  if (m) return take(m[1], m[2], true);

  m = token0.match(/^([A-Za-z0-9_.$-]+)\s*\(\(\s*([\s\S]*?)\s*\)\)$/);
  if (m) return take(m[1], m[2], false);
  m = token0.match(/^([A-Za-z0-9_.$-]+)\s*\(\s*([\s\S]*?)\s*\)$/);
  if (m) return take(m[1], m[2], false);

  return take(token0, token0, false);
}

export function parseFlowchartEdges(src: string): { nodes: Map<string, FlowNode>; edges: FlowEdge[] } {
  const lines = normalizeNewlines(src).split('\n').slice(1);
  const nodes = new Map<string, FlowNode>();
  const edges: FlowEdge[] = [];

  const ensureNode = (token: string) => {
    const n = parseFlowchartToken(token);
    if (!n.id) return null;
    const existing = nodes.get(n.id);
    if (!existing) nodes.set(n.id, n);
    else if (!existing.label && n.label) nodes.set(n.id, { ...existing, label: n.label });
    else if (!existing.validation && n.validation) nodes.set(n.id, { ...existing, validation: true });
    return nodes.get(n.id) || null;
  };

  for (const raw of lines) {
    const line = stripMermaidComments(raw).trim();
    if (!line) continue;
    if (/^(subgraph|end)\b/i.test(line)) continue;
    if (/^classDef\b/i.test(line)) continue;
    if (/^class\b/i.test(line)) continue;
    if (/^style\b/i.test(line)) continue;

    const def = line.match(/^([A-Za-z0-9_.$-]+)\s*:\s*(.+)$/);
    if (def && !line.includes('--')) {
      const id = def[1].trim();
      const label = def[2].trim();
      if (id) nodes.set(id, { id, label, validation: nodes.get(id)?.validation });
      continue;
    }

    const standalone = line.match(/^([A-Za-z0-9_.$-]+)\s*[\[{(]/);
    if (standalone && !line.includes('--')) {
      ensureNode(line);
      continue;
    }

    const parseEdge = (): FlowEdge | null => {
      let m = line.match(/^(.+?)\s*[-.]{1,2}[-.]*>\s*\|([\s\S]*?)\|\s*(.+)$/);
      if (m) {
        const aTok = m[1].trim();
        const label = safeSingleLine(m[2]);
        const bTok = m[3].trim();
        const dashed = /[-.]{2,}/.test(line) || /\.\./.test(line) || /-\.-/.test(line);
        const a = ensureNode(aTok);
        const b = ensureNode(bTok);
        if (!a || !b) return null;
        return { from: a.id, to: b.id, label, dashed };
      }

      m = line.match(/^(.+?)\s*--\s*([\s\S]*?)\s*-->\s*(.+)$/);
      if (m) {
        const a = ensureNode(m[1].trim());
        const b = ensureNode(m[3].trim());
        if (!a || !b) return null;
        return { from: a.id, to: b.id, label: safeSingleLine(m[2]), dashed: false };
      }

      m = line.match(/^(.+?)\s*-\.\s*([\s\S]*?)\s*\.\->\s*(.+)$/);
      if (m) {
        const a = ensureNode(m[1].trim());
        const b = ensureNode(m[3].trim());
        if (!a || !b) return null;
        return { from: a.id, to: b.id, label: safeSingleLine(m[2]), dashed: true };
      }

      m = line.match(/^(.+?)\s*([-.=]{1,4}>{1,2})\s*(.+)$/);
      if (m) {
        const a = ensureNode(m[1].trim());
        const b = ensureNode(m[3].trim());
        if (!a || !b) return null;
        const op = m[2] || '';
        const dashed =
          op.includes('.') || op.includes('-.') || op.includes('..') || op.includes('--') || op.includes('=')
            ? op.includes('.') || op.includes('-.') || op.includes('..')
            : false;
        return { from: a.id, to: b.id, dashed: dashed || op.includes('..') || op.includes('-.') };
      }

      return null;
    };

    const e = parseEdge();
    if (e) edges.push(e);
  }

  return { nodes, edges };
}

function buildSpanningTree(opts: {
  nodes: Map<string, FlowNode>;
  edges: FlowEdge[];
  preferStartId?: string | null;
}): { roots: string[]; treeEdges: FlowEdge[]; childrenBy: Map<string, FlowEdge[]> } {
  const { nodes, edges, preferStartId } = opts;
  const incoming = new Map<string, number>();
  nodes.forEach((_, id) => incoming.set(id, 0));
  edges.forEach((e) => incoming.set(e.to, (incoming.get(e.to) || 0) + 1));

  let roots = Array.from(nodes.keys()).filter((id) => (incoming.get(id) || 0) === 0);
  if (preferStartId && nodes.has(preferStartId)) roots = [preferStartId, ...roots.filter((x) => x !== preferStartId)];
  if (!roots.length && nodes.size) roots = [Array.from(nodes.keys())[0]];

  const adj = new Map<string, FlowEdge[]>();
  edges.forEach((e) => {
    adj.set(e.from, [...(adj.get(e.from) || []), e]);
  });

  const treeEdges: FlowEdge[] = [];
  const seen = new Set<string>();
  const parentOf = new Map<string, string>();

  const visit = (id: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    const out = adj.get(id) || [];
    for (const e of out) {
      if (parentOf.has(e.to)) continue;
      parentOf.set(e.to, id);
      treeEdges.push(e);
      visit(e.to);
    }
  };

  roots.forEach(visit);

  const childrenBy = new Map<string, FlowEdge[]>();
  treeEdges.forEach((e) => {
    childrenBy.set(e.from, [...(childrenBy.get(e.from) || []), e]);
  });
  return { roots, treeEdges, childrenBy };
}

export function buildProcessFlowFromMermaidFlowchart(src: string, opts?: { title?: string; ensureEndNode?: boolean }): FlowBuildResult {
  const { nodes, edges } = parseFlowchartEdges(src);
  if (!nodes.size) {
    return {
      title: opts?.title || 'Mermaid process flow',
      lines: [{ indent: 0, content: 'Mermaid (empty)' }],
      flowNodeByKey: new Map(),
      connectorLabels: {},
    };
  }

  const preferStart = (() => {
    const byLabel = Array.from(nodes.values()).find((n) => n.label.toLowerCase() === 'start');
    return byLabel?.id || null;
  })();

  const tree = buildSpanningTree({ nodes, edges, preferStartId: preferStart });

  const lines: NodeLine[] = [];
  const flowNodeByKey: FlowBuildResult['flowNodeByKey'] = new Map();
  const connectorLabels: Record<string, { label: string; color: string }> = {};

  let running = 1;

  const treeEdgeSet = new Set(tree.treeEdges);
  const extraByFrom = new Map<string, FlowEdge[]>();
  edges.forEach((e) => {
    if (treeEdgeSet.has(e)) return;
    extraByFrom.set(e.from, [...(extraByFrom.get(e.from) || []), e]);
  });

  const emitNode = (id: string, indent: number, parentPath: string[]) => {
    const n = nodes.get(id);
    if (!n) return;
    const label = n.label || id;
    const content = `${label} #flow#`;
    const lineIndex = lines.length;
    lines.push({ indent, content });
    const type: 'validation' | 'end' | undefined = n.end ? 'end' : n.validation ? 'validation' : undefined;
    flowNodeByKey.set(id, { lineIndex, runningNumber: running++, parentPath, label, ...(type ? { type } : null) });

    const children = tree.childrenBy.get(id) || [];
    children.forEach((e) => {
      const childId = e.to;
      const childParentPath = [label, ...parentPath];
      emitNode(childId, indent + 1, childParentPath);
    });

    const extras = extraByFrom.get(id) || [];
    extras.forEach((e, idx) => {
      if (!e.to || e.to === id) return;
      const target = nodes.get(e.to);
      const targetLabel = target?.label || e.to;
      const gotoLabel = `Go to: ${targetLabel}`;
      const gotoLineIndex = lines.length;
      lines.push({ indent: indent + 1, content: `${gotoLabel} #flow#` });
      flowNodeByKey.set(`goto:${id}:${e.to}:${idx}`, {
        lineIndex: gotoLineIndex,
        runningNumber: running++,
        parentPath: [label, ...parentPath],
        label: gotoLabel,
        type: 'goto',
        gotoTargetMermaidId: e.to,
      });
    });
  };

  const rootLabel = safeSingleLine(opts?.title || 'Mermaid process flow');
  const rootLineIndex = lines.length;
  lines.push({ indent: 0, content: `${rootLabel} #flow#` });
  flowNodeByKey.set('__root__', { lineIndex: rootLineIndex, runningNumber: running++, parentPath: [], label: rootLabel });

  tree.roots.forEach((rid) => {
    emitNode(rid, 1, [rootLabel]);
  });

  if (opts?.ensureEndNode) {
    const emittedIds = Array.from(flowNodeByKey.keys()).filter((k) => k !== '__root__');
    const lastId = emittedIds.length ? emittedIds[emittedIds.length - 1] : null;
    if (lastId) {
      const last = flowNodeByKey.get(lastId);
      if (last) {
        const endLineIndex = lines.length;
        const lastIndent = lines[last.lineIndex]?.indent ?? 1;
        lines.push({ indent: lastIndent + 1, content: `End #flow#` });
        flowNodeByKey.set('__end__', {
          lineIndex: endLineIndex,
          runningNumber: running++,
          parentPath: [last.label, ...(last.parentPath || [])],
          label: 'End',
          type: 'end',
        });
      }
    }
  }

  const lineIndexByMermaidId = new Map<string, number>();
  flowNodeByKey.forEach((v, k) => {
    if (k === '__root__' || k === '__end__') return;
    if (!k.startsWith('goto:')) lineIndexByMermaidId.set(k, v.lineIndex);
  });

  tree.treeEdges.forEach((e) => {
    const fromLine = lineIndexByMermaidId.get(e.from);
    const toLine = lineIndexByMermaidId.get(e.to);
    if (fromLine == null || toLine == null) return;
    const fromNodeId = nodeIdForLineIndex(fromLine);
    const toNodeId = nodeIdForLineIndex(toLine);
    const label = safeSingleLine(e.label || '');
    if (!label) return;
    connectorLabels[`${fromNodeId}__${toNodeId}`] = { label, color: '#000000' };
  });

  flowNodeByKey.forEach((v) => {
    if (v.type !== 'goto' || !v.gotoTargetMermaidId) return;
    const targetLine = lineIndexByMermaidId.get(v.gotoTargetMermaidId);
    if (targetLine == null) return;
    v.gotoTargetNodeId = nodeIdForLineIndex(targetLine);
  });

  return { title: rootLabel, lines, flowNodeByKey, connectorLabels };
}

export function buildFlowNodesBlock(flowNodeByKey: Map<string, { lineIndex: number; runningNumber: number; parentPath: string[]; label: string }>) {
  const entries = Array.from(flowNodeByKey.values())
    .filter((v) => v.runningNumber && v.lineIndex >= 0)
    .sort((a, b) => a.runningNumber - b.runningNumber)
    .map((v) => ({
      runningNumber: v.runningNumber,
      content: v.label.trim(),
      parentPath: v.parentPath,
      lineIndex: v.lineIndex,
    }));
  const max = entries.reduce((m, e) => Math.max(m, e.runningNumber), 0);
  return { nextRunningNumber: max + 1, entries };
}

export function buildProcessNodeTypeBlocks(
  flowNodeByKey: Map<string, { lineIndex: number; runningNumber: number; type?: 'validation' | 'end' | 'goto' }>,
) {
  const blocks: Array<{ type: string; body: unknown }> = [];
  flowNodeByKey.forEach((v) => {
    if (!v.type) return;
    const nodeId = nodeIdForLineIndex(v.lineIndex);
    blocks.push({ type: `process-node-type-${v.runningNumber}`, body: { type: v.type, nodeId } });
  });
  return blocks;
}

export function buildProcessGotoBlocks(
  flowNodeByKey: Map<string, { runningNumber: number; type?: 'validation' | 'end' | 'goto'; gotoTargetNodeId?: string }>,
) {
  const blocks: Array<{ type: string; body: unknown }> = [];
  flowNodeByKey.forEach((v) => {
    if (v.type !== 'goto') return;
    if (!v.gotoTargetNodeId) return;
    blocks.push({ type: `process-goto-${v.runningNumber}`, body: { targetId: v.gotoTargetNodeId } });
  });
  return blocks;
}

