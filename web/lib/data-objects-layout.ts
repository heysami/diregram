import type { DataObjectEdge, DataObjectGraph } from '@/lib/data-object-graph';

export type LayoutNode = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

function seededRand01(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    // xorshift32
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 1_000_000) / 1_000_000;
  };
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function buildAdjUndirected(graph: DataObjectGraph): Map<string, Set<string>> {
  const adj = new Map<string, Set<string>>();
  graph.objects.forEach((o) => adj.set(o.id, new Set()));
  graph.edges.forEach((e) => {
    if (!adj.has(e.fromId)) adj.set(e.fromId, new Set());
    if (!adj.has(e.toId)) adj.set(e.toId, new Set());
    adj.get(e.fromId)!.add(e.toId);
    adj.get(e.toId)!.add(e.fromId);
  });
  return adj;
}

function connectedComponents(graph: DataObjectGraph): string[][] {
  const adj = buildAdjUndirected(graph);
  const seen = new Set<string>();
  const comps: string[][] = [];
  const ids = Array.from(adj.keys()).sort();
  ids.forEach((id) => {
    if (seen.has(id)) return;
    const stack = [id];
    seen.add(id);
    const comp: string[] = [];
    while (stack.length) {
      const cur = stack.pop()!;
      comp.push(cur);
      (adj.get(cur) || new Set()).forEach((n) => {
        if (seen.has(n)) return;
        seen.add(n);
        stack.push(n);
      });
    }
    comps.push(comp.sort());
  });
  comps.sort((a, b) => b.length - a.length || a[0].localeCompare(b[0]));
  return comps;
}

function isCyclicDirected(nodes: Set<string>, edges: DataObjectEdge[]): boolean {
  const out = new Map<string, string[]>();
  nodes.forEach((id) => out.set(id, []));
  edges.forEach((e) => {
    if (!nodes.has(e.fromId) || !nodes.has(e.toId)) return;
    out.get(e.fromId)!.push(e.toId);
  });

  const visiting = new Set<string>();
  const visited = new Set<string>();

  const dfs = (id: string): boolean => {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    for (const to of out.get(id) || []) {
      if (dfs(to)) return true;
    }
    visiting.delete(id);
    visited.add(id);
    return false;
  };

  for (const id of nodes) {
    if (dfs(id)) return true;
  }
  return false;
}

function forceLayoutComponent(opts: {
  ids: string[];
  edges: DataObjectEdge[];
  widthById: Map<string, number>;
  heightById: Map<string, number>;
  seed: number;
  mode: 'cyclic' | 'acyclic';
}): Map<string, { x: number; y: number }> {
  const { ids, edges, widthById, heightById, seed, mode } = opts;
  const rand = seededRand01(seed);

  const pos = new Map<string, { x: number; y: number }>();
  const vel = new Map<string, { x: number; y: number }>();

  const n = ids.length;
  const baseR = 120 + n * 10;
  ids.forEach((id, idx) => {
    const a = (idx / Math.max(1, n)) * Math.PI * 2;
    const jitter = (rand() - 0.5) * 30;
    const x = mode === 'cyclic' ? Math.cos(a) * (baseR + jitter) : (rand() - 0.5) * 260;
    const y = mode === 'cyclic' ? Math.sin(a) * (baseR + jitter) : (rand() - 0.5) * 260;
    pos.set(id, { x, y });
    vel.set(id, { x: 0, y: 0 });
  });

  const edgePairs = edges.filter((e) => pos.has(e.fromId) && pos.has(e.toId));
  const desiredLen = mode === 'cyclic' ? 240 : 280;
  const repulsion = mode === 'cyclic' ? 18_000 : 22_000;
  const springK = mode === 'cyclic' ? 0.012 : 0.01;
  const damping = 0.86;
  const centerK = mode === 'cyclic' ? 0.0008 : 0.0006;

  const radiusById = new Map<string, number>();
  ids.forEach((id) => {
    const w = widthById.get(id) ?? 220;
    const h = heightById.get(id) ?? 64;
    radiusById.set(id, Math.max(w, h) * 0.55);
  });

  const ITER = Math.min(520, 240 + n * 14);
  for (let it = 0; it < ITER; it += 1) {
    const acc = new Map<string, { x: number; y: number }>();
    ids.forEach((id) => acc.set(id, { x: 0, y: 0 }));

    for (let i = 0; i < n; i += 1) {
      const aId = ids[i];
      const aPos = pos.get(aId)!;
      for (let j = i + 1; j < n; j += 1) {
        const bId = ids[j];
        const bPos = pos.get(bId)!;
        const dx = aPos.x - bPos.x;
        const dy = aPos.y - bPos.y;
        const dist = Math.max(1, Math.hypot(dx, dy));
        const ux = dx / dist;
        const uy = dy / dist;

        const ra = radiusById.get(aId) ?? 80;
        const rb = radiusById.get(bId) ?? 80;
        const minDist = ra + rb + 18;
        const overlap = Math.max(0, minDist - dist);

        const repF = repulsion / (dist * dist);
        const colF = overlap > 0 ? overlap * 0.18 : 0;
        const f = repF + colF;

        const aAcc = acc.get(aId)!;
        const bAcc = acc.get(bId)!;
        aAcc.x += ux * f;
        aAcc.y += uy * f;
        bAcc.x -= ux * f;
        bAcc.y -= uy * f;
      }
    }

    edgePairs.forEach((e) => {
      const aId = e.fromId;
      const bId = e.toId;
      const aPos = pos.get(aId)!;
      const bPos = pos.get(bId)!;
      const dx = bPos.x - aPos.x;
      const dy = bPos.y - aPos.y;
      const dist = Math.max(1, Math.hypot(dx, dy));
      const ux = dx / dist;
      const uy = dy / dist;
      const delta = dist - desiredLen;
      const f = delta * springK;
      const aAcc = acc.get(aId)!;
      const bAcc = acc.get(bId)!;
      aAcc.x += ux * f;
      aAcc.y += uy * f;
      bAcc.x -= ux * f;
      bAcc.y -= uy * f;
    });

    ids.forEach((id) => {
      const p = pos.get(id)!;
      const a = acc.get(id)!;
      a.x += -p.x * centerK;
      a.y += -p.y * centerK;
    });

    ids.forEach((id) => {
      const v = vel.get(id)!;
      const a = acc.get(id)!;
      v.x = (v.x + a.x) * damping;
      v.y = (v.y + a.y) * damping;
      const p = pos.get(id)!;
      p.x += v.x;
      p.y += v.y;
    });
  }

  return pos;
}

export function layoutGraphWeb(
  graph: DataObjectGraph,
  heightById: Map<string, number>,
): { nodes: LayoutNode[]; bounds: { width: number; height: number } } {
  const widthById = new Map<string, number>();
  graph.objects.forEach((o) => widthById.set(o.id, 220));
  const byId = new Map(graph.objects.map((o) => [o.id, o]));

  const comps = connectedComponents(graph);
  const nodes: LayoutNode[] = [];
  const PAD = 80;
  const COMP_GAP = 160;
  const maxRowW = 1800;

  let cursorX = PAD;
  let cursorY = PAD;
  let rowH = 0;

  comps.forEach((ids) => {
    const set = new Set(ids);
    const edges = graph.edges.filter((e) => set.has(e.fromId) && set.has(e.toId));
    const cyclic = isCyclicDirected(set, edges);
    const seed = hashString(ids.join('|'));
    const pos = forceLayoutComponent({
      ids,
      edges,
      widthById,
      heightById,
      seed,
      mode: cyclic ? 'cyclic' : 'acyclic',
    });

    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    ids.forEach((id) => {
      const p = pos.get(id)!;
      const w = widthById.get(id) ?? 220;
      const h = heightById.get(id) ?? 64;
      minX = Math.min(minX, p.x - w / 2);
      minY = Math.min(minY, p.y - h / 2);
      maxX = Math.max(maxX, p.x + w / 2);
      maxY = Math.max(maxY, p.y + h / 2);
    });
    const compW = Math.max(520, maxX - minX + PAD * 0.5);
    const compH = Math.max(360, maxY - minY + PAD * 0.5);

    if (cursorX + compW > maxRowW) {
      cursorX = PAD;
      cursorY += rowH + COMP_GAP;
      rowH = 0;
    }

    ids.forEach((id) => {
      const o = byId.get(id);
      if (!o) return;
      const p = pos.get(id)!;
      const w = widthById.get(id) ?? 220;
      const h = heightById.get(id) ?? 64;
      nodes.push({
        id,
        x: cursorX + (p.x - w / 2 - minX),
        y: cursorY + (p.y - h / 2 - minY),
        width: w,
        height: h,
      });
    });

    cursorX += compW + COMP_GAP;
    rowH = Math.max(rowH, compH);
  });

  const maxX = nodes.reduce((m, n) => Math.max(m, n.x + n.width), 0);
  const maxY = nodes.reduce((m, n) => Math.max(m, n.y + n.height), 0);
  return { nodes, bounds: { width: Math.max(900, maxX + PAD), height: Math.max(650, maxY + PAD) } };
}

function rectAnchor(node: LayoutNode, toward: { x: number; y: number }): { x: number; y: number } {
  const cx = node.x + node.width / 2;
  const cy = node.y + node.height / 2;
  const dx = toward.x - cx;
  const dy = toward.y - cy;
  const adx = Math.abs(dx) || 1e-6;
  const ady = Math.abs(dy) || 1e-6;
  const sx = (node.width / 2) / adx;
  const sy = (node.height / 2) / ady;
  const t = Math.min(sx, sy);
  return { x: cx + dx * t, y: cy + dy * t };
}

export function edgePath(
  from: LayoutNode,
  to: LayoutNode,
  offset: number,
): {
  d: string;
  start: { x: number; y: number };
  end: { x: number; y: number };
  c1: { x: number; y: number };
  c2: { x: number; y: number };
  angleDeg: number;
} {
  const fromC = { x: from.x + from.width / 2, y: from.y + from.height / 2 };
  const toC = { x: to.x + to.width / 2, y: to.y + to.height / 2 };
  const start = rectAnchor(from, toC);
  const end = rectAnchor(to, fromC);

  const vx = end.x - start.x;
  const vy = end.y - start.y;
  const dist = Math.max(1, Math.hypot(vx, vy));
  const ux = vx / dist;
  const uy = vy / dist;
  const nx = -uy;
  const ny = ux;

  const pull = Math.min(180, dist * 0.35);
  const baseCurve = Math.min(54, dist * 0.12);
  const curve = baseCurve + offset;

  const c1 = { x: start.x + ux * pull + nx * curve, y: start.y + uy * pull + ny * curve };
  const c2 = { x: end.x - ux * pull + nx * curve, y: end.y - uy * pull + ny * curve };
  const d = `M ${start.x} ${start.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${end.x} ${end.y}`;
  const angleDeg = (Math.atan2(vy, vx) * 180) / Math.PI;
  return { d, start, end, c1, c2, angleDeg };
}

function undirectedPairKey(e: DataObjectEdge): string {
  return e.fromId < e.toId ? `${e.fromId}__${e.toId}` : `${e.toId}__${e.fromId}`;
}

export function computeParallelOffsets(edges: DataObjectEdge[]): Map<number, number> {
  const groups = new Map<string, Array<{ idx: number; e: DataObjectEdge }>>();
  edges.forEach((e, idx) => {
    const k = undirectedPairKey(e);
    const g = groups.get(k) || [];
    g.push({ idx, e });
    groups.set(k, g);
  });
  const offsets = new Map<number, number>();
  groups.forEach((g) => {
    if (g.length <= 1) return;
    const sorted = [...g].sort((a, b) =>
      `${a.e.fromId}->${a.e.toId}:${a.e.kind}`.localeCompare(`${b.e.fromId}->${b.e.toId}:${b.e.kind}`),
    );
    const mid = (sorted.length - 1) / 2;
    sorted.forEach((it, i) => {
      offsets.set(it.idx, (i - mid) * 18);
    });
  });
  return offsets;
}

