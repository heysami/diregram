'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type * as Y from 'yjs';
import { parseNexusMarkdown } from '@/lib/nexus-parser';
import { buildProcessRunningNumberMap } from '@/lib/process-running-number-map';

export function useParsedNexusDoc(doc: Y.Doc | null): {
  docRev: number;
  roots: any[];
  nodeById: Map<string, any>;
  processFlowModeNodes: Set<string>;
  getProcessRunningNumber: (nodeId: string) => number | undefined;
} {
  const [docRev, setDocRev] = useState(0);
  useEffect(() => {
    if (!doc) return;
    const yText = doc.getText('nexus');
    const onUpdate = () => setDocRev((n) => n + 1);
    yText.observe(onUpdate);
    return () => yText.unobserve(onUpdate);
  }, [doc]);

  const roots = useMemo(() => {
    void docRev;
    if (!doc) return [];
    try {
      return parseNexusMarkdown(doc.getText('nexus').toString());
    } catch {
      return [];
    }
  }, [doc, docRev]);

  const nodeById = useMemo(() => {
    const map = new Map<string, any>();
    const stack: any[] = [...roots];
    while (stack.length) {
      const n = stack.pop()!;
      if (!n?.id) continue;
      if (map.has(n.id)) continue;
      map.set(n.id, n);
      (n.children || []).forEach((c: any) => stack.push(c));
      if (n.isHub && n.variants) (n.variants || []).forEach((v: any) => v?.id && v.id !== n.id && stack.push(v));
    }
    return map;
  }, [roots]);

  const processRunningNumberMap = useMemo(() => {
    if (!doc) return new Map<string, number>();
    try {
      return buildProcessRunningNumberMap({ doc, roots });
    } catch {
      return new Map<string, number>();
    }
  }, [doc, roots]);

  const processFlowModeNodes = useMemo(() => {
    const next = new Set<string>();
    for (const n of nodeById.values()) {
      if (!n?.isFlowNode) continue;
      const parentId = n.parentId || null;
      const parent = parentId ? nodeById.get(parentId) : null;
      const isRootProcessNode = !parent || !parent.isFlowNode;
      if (!isRootProcessNode) continue;
      if (processRunningNumberMap.has(n.id)) next.add(n.id);
    }
    return next;
  }, [nodeById, processRunningNumberMap]);

  const processRunningNumberMapRef = useRef<Map<string, number>>(new Map());
  useEffect(() => {
    processRunningNumberMapRef.current = processRunningNumberMap;
  }, [processRunningNumberMap]);

  const getProcessRunningNumber = useMemo(() => {
    return (nodeId: string) => processRunningNumberMapRef.current.get(nodeId);
  }, []);

  return { docRev, roots, nodeById, processFlowModeNodes, getProcessRunningNumber };
}

