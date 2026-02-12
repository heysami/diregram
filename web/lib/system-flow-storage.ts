import * as Y from 'yjs';

export type SystemFlowSide = 'left' | 'right' | 'top' | 'bottom';

export type SystemFlowBoxPersisted = {
  /** Stable identifier (persisted). */
  key: string;
  name: string;
  icon?: string;
  color?: string;
  annotation?: string;
  dataObjectId?: string;
  dataObjectAttributeIds?: string[];
  gridX: number;
  gridY: number;
  gridWidth: number;
  gridHeight: number;
};

export type SystemFlowZonePersisted = {
  id: string;
  name: string;
  boxKeys: string[];
  outlineStyle?: 'solid' | 'dashed' | 'dotted' | 'double';
};

export type SystemFlowLinkPersisted = {
  id: string;
  fromKey: string;
  toKey: string;
  fromSide?: SystemFlowSide;
  toSide?: SystemFlowSide;
  text?: string;
  order?: number;
  /** Optional bend points in local canvas pixel coordinates (relative to the grid container). */
  points?: Array<{ x: number; y: number }>;
  /** Solid by default. */
  dashStyle?: 'solid' | 'dashed';
  /** Shape at start/end of the link. */
  startShape?: 'none' | 'arrow' | 'circle' | 'square';
  endShape?: 'none' | 'arrow' | 'circle' | 'square';
  /** Optional label position override in local canvas pixel coordinates (relative to the grid container). */
  labelPos?: { x: number; y: number };
};

export type SystemFlowStatePersistedV1 = {
  version: 1;
  gridWidth: number;
  gridHeight: number;
  boxes: SystemFlowBoxPersisted[];
  zones: SystemFlowZonePersisted[];
  links: SystemFlowLinkPersisted[];
};

export type SystemFlowState = SystemFlowStatePersistedV1;

function getSystemFlowBlockRegex(sfid: string): RegExp {
  // NOTE: sfid is stable and user-controlled only via our UI; still escape it for regex safety.
  const safe = sfid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(String.raw`\`\`\`systemflow-${safe}\n([\s\S]*?)\n\`\`\``);
}

function getSystemFlowFullBlockRegex(sfid: string): RegExp {
  const safe = sfid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(String.raw`\`\`\`systemflow-${safe}\n[\s\S]*?\n\`\`\``);
}

function defaultState(): SystemFlowState {
  return {
    version: 1,
    gridWidth: 24,
    gridHeight: 24,
    boxes: [],
    zones: [],
    links: [],
  };
}

function coerceState(raw: unknown): SystemFlowState {
  const d = defaultState();
  if (!raw || typeof raw !== 'object') return d;
  const r = raw as Record<string, unknown>;
  if (r.version !== 1) return d;

  const gridWidth = typeof r.gridWidth === 'number' && Number.isFinite(r.gridWidth) ? r.gridWidth : d.gridWidth;
  const gridHeight = typeof r.gridHeight === 'number' && Number.isFinite(r.gridHeight) ? r.gridHeight : d.gridHeight;

  const boxes = Array.isArray(r.boxes)
    ? (r.boxes as unknown[])
        .map((b): SystemFlowBoxPersisted | null => {
          if (!b || typeof b !== 'object') return null;
          const o = b as Record<string, unknown>;
          const key = typeof o.key === 'string' ? o.key.trim() : '';
          const name = typeof o.name === 'string' ? o.name : '';
          if (!key) return null;
          if (typeof o.gridX !== 'number' || typeof o.gridY !== 'number' || typeof o.gridWidth !== 'number' || typeof o.gridHeight !== 'number') return null;
          return {
            key,
            name,
            icon: typeof o.icon === 'string' ? o.icon : undefined,
            color: typeof o.color === 'string' ? o.color : undefined,
            annotation: typeof o.annotation === 'string' ? o.annotation : undefined,
            dataObjectId: typeof o.dataObjectId === 'string' ? o.dataObjectId : undefined,
            dataObjectAttributeIds: Array.isArray(o.dataObjectAttributeIds)
              ? (o.dataObjectAttributeIds as unknown[]).map((x) => (typeof x === 'string' ? x.trim() : '')).filter(Boolean)
              : undefined,
            gridX: o.gridX as number,
            gridY: o.gridY as number,
            gridWidth: o.gridWidth as number,
            gridHeight: o.gridHeight as number,
          };
        })
        .filter((x): x is SystemFlowBoxPersisted => x !== null)
    : d.boxes;

  const zones = Array.isArray(r.zones)
    ? (r.zones as unknown[])
        .map((z): SystemFlowZonePersisted | null => {
          if (!z || typeof z !== 'object') return null;
          const o = z as Record<string, unknown>;
          const id = typeof o.id === 'string' ? o.id.trim() : '';
          const name = typeof o.name === 'string' ? o.name : '';
          const boxKeys = Array.isArray(o.boxKeys)
            ? (o.boxKeys as unknown[]).map((x) => (typeof x === 'string' ? x.trim() : '')).filter(Boolean)
            : [];
          if (!id) return null;
          const outlineStyle =
            o.outlineStyle === 'solid' || o.outlineStyle === 'dashed' || o.outlineStyle === 'dotted' || o.outlineStyle === 'double'
              ? (o.outlineStyle as SystemFlowZonePersisted['outlineStyle'])
              : undefined;
          return { id, name, boxKeys, outlineStyle };
        })
        .filter((x): x is SystemFlowZonePersisted => x !== null)
    : d.zones;

  const links = Array.isArray(r.links)
    ? (r.links as unknown[])
        .map((l): SystemFlowLinkPersisted | null => {
          if (!l || typeof l !== 'object') return null;
          const o = l as Record<string, unknown>;
          const id = typeof o.id === 'string' ? o.id.trim() : '';
          const fromKey = typeof o.fromKey === 'string' ? o.fromKey.trim() : '';
          const toKey = typeof o.toKey === 'string' ? o.toKey.trim() : '';
          if (!id || !fromKey || !toKey) return null;
          const fromSide = typeof o.fromSide === 'string' ? (o.fromSide as SystemFlowSide) : undefined;
          const toSide = typeof o.toSide === 'string' ? (o.toSide as SystemFlowSide) : undefined;
          const order = typeof o.order === 'number' && Number.isFinite(o.order) ? o.order : undefined;
          const points = Array.isArray(o.points)
            ? (o.points as unknown[])
                .map((p) => p as Record<string, unknown>)
                .map((p) => ({ x: typeof p.x === 'number' ? p.x : 0, y: typeof p.y === 'number' ? p.y : 0 }))
            : undefined;
          const dashStyle = o.dashStyle === 'dashed' ? 'dashed' : o.dashStyle === 'solid' ? 'solid' : undefined;
          const startShape =
            o.startShape === 'arrow' || o.startShape === 'circle' || o.startShape === 'square' || o.startShape === 'none'
              ? (o.startShape as SystemFlowLinkPersisted['startShape'])
              : undefined;
          const endShape =
            o.endShape === 'arrow' || o.endShape === 'circle' || o.endShape === 'square' || o.endShape === 'none'
              ? (o.endShape as SystemFlowLinkPersisted['endShape'])
              : undefined;
          const labelPos = (() => {
            const lp = o.labelPos as unknown;
            if (!lp || typeof lp !== 'object') return undefined;
            const rec = lp as Record<string, unknown>;
            const x = typeof rec.x === 'number' ? rec.x : null;
            const y = typeof rec.y === 'number' ? rec.y : null;
            if (x === null || y === null) return undefined;
            return { x, y };
          })();
          return {
            id,
            fromKey,
            toKey,
            fromSide,
            toSide,
            text: typeof o.text === 'string' ? o.text : undefined,
            order,
            points,
            dashStyle,
            startShape,
            endShape,
            labelPos,
          };
        })
        .filter((x): x is SystemFlowLinkPersisted => x !== null)
    : d.links;

  return {
    version: 1,
    gridWidth: Math.max(1, Math.min(200, Math.round(gridWidth))),
    gridHeight: Math.max(1, Math.min(200, Math.round(gridHeight))),
    boxes,
    zones,
    links,
  };
}

export function loadSystemFlowStateFromMarkdown(markdown: string, sfid: string): SystemFlowState {
  const match = markdown.match(getSystemFlowBlockRegex(sfid));
  if (!match) return defaultState();
  try {
    return coerceState(JSON.parse(match[1]));
  } catch {
    return defaultState();
  }
}

export function saveSystemFlowStateToMarkdown(markdown: string, sfid: string, state: SystemFlowState): string {
  const payload: SystemFlowState = {
    version: 1,
    gridWidth: state.gridWidth,
    gridHeight: state.gridHeight,
    boxes: state.boxes,
    zones: state.zones,
    links: state.links,
  };

  const block = `\`\`\`systemflow-${sfid}\n${JSON.stringify(payload, null, 2)}\n\`\`\``;
  let next = markdown;

  if (getSystemFlowFullBlockRegex(sfid).test(next)) {
    next = next.replace(getSystemFlowFullBlockRegex(sfid), block);
    return next;
  }

  const separatorIndex = next.indexOf('\n---\n');
  if (separatorIndex !== -1) {
    next = next.slice(0, separatorIndex) + '\n' + block + '\n' + next.slice(separatorIndex);
  } else {
    next = next + (next.endsWith('\n') ? '' : '\n') + '\n' + block;
  }

  return next;
}

export function loadSystemFlowStateFromDoc(doc: Y.Doc, sfid: string): SystemFlowState {
  const yText = doc.getText('nexus');
  return loadSystemFlowStateFromMarkdown(yText.toString(), sfid);
}

export function saveSystemFlowStateToDoc(doc: Y.Doc, sfid: string, state: SystemFlowState): void {
  const yText = doc.getText('nexus');
  const current = yText.toString();
  const next = saveSystemFlowStateToMarkdown(current, sfid, state);
  if (next === current) return;
  doc.transact(() => {
    yText.delete(0, yText.length);
    yText.insert(0, next);
  });
}

