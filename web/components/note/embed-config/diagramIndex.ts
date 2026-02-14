'use client';

import { parseNexusMarkdown } from '@/lib/nexus-parser';
import type { NexusNode } from '@/types/nexus';

export type DiagramIndex = {
  mainRoots: Array<{ id: string; label: string }>;
  flowRoots: Array<{ id: string; label: string }>;
  systemFlows: Array<{ sfid: string; label: string }>;
};

export function buildDiagramIndexFromMarkdown(markdown: string): DiagramIndex {
  const roots = parseNexusMarkdown(markdown || '');
  const mainRoots: DiagramIndex['mainRoots'] = [];
  const flowRoots: DiagramIndex['flowRoots'] = [];
  const systemFlows: DiagramIndex['systemFlows'] = [];

  const visited = new Set<string>();
  const visit = (n: NexusNode) => {
    if (!n || !n.id) return;
    if (visited.has(n.id)) return;
    visited.add(n.id);

    const meta = (n.metadata || {}) as any;
    const label = String(n.content || '').trim() || n.id;

    if (meta?.systemFlow) {
      const sfid = String(meta?.sfid || n.id).trim() || n.id;
      systemFlows.push({ sfid, label });
    }

    n.children.forEach(visit);
    if (n.isHub && n.variants) {
      n.variants.forEach((v) => {
        visit(v);
        v.children?.forEach?.(visit);
      });
    }
  };

  roots.forEach(visit);

  roots.forEach((r) => {
    const meta = (r.metadata || {}) as any;
    const label = String(r.content || '').trim() || r.id;
    if (meta?.flowTab) flowRoots.push({ id: r.id, label });
    else mainRoots.push({ id: r.id, label });
  });

  const uniqBy = <T,>(xs: T[], key: (x: T) => string): T[] => {
    const seen = new Set<string>();
    const out: T[] = [];
    xs.forEach((x) => {
      const k = key(x);
      if (seen.has(k)) return;
      seen.add(k);
      out.push(x);
    });
    return out;
  };

  return {
    mainRoots: uniqBy(mainRoots, (x) => x.id).sort((a, b) => a.label.localeCompare(b.label)),
    flowRoots: uniqBy(flowRoots, (x) => x.id).sort((a, b) => a.label.localeCompare(b.label)),
    systemFlows: uniqBy(systemFlows, (x) => x.sfid).sort((a, b) => a.label.localeCompare(b.label)),
  };
}

