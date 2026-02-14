import * as Y from 'yjs';

function notNull<T>(x: T | null): x is T {
  return x !== null;
}

export interface ExpandedGridNodePersisted {
  /**
   * Stable identifier for the grid node (persisted).
   * This enables selection + inspector editing without relying on array index.
   */
  key?: string;
  content: string;
  icon?: string; // emoji / ascii shown above text
  color?: string; // semantic color name (e.g. "slate", "blue")
  uiType?: ExpandedGridUiType;
  /**
   * Advanced UI configs for richer "inner node" previews.
   * These are purely presentational; they do not affect graph semantics.
   */
  uiTabs?: ExpandedGridUiTab[]; // tabs / wizard / sideNav (shared schema)
  uiSections?: ExpandedGridUiSection[]; // collapsible sections
  textVariant?: ExpandedGridTextVariant; // text node variant
  textAlign?: ExpandedGridTextAlign; // text node alignment
  dataObjectId?: string; // link to shared data object store
  // Optional: selected attributes of the linked object (multi-select)
  // Special id: "__objectName__" represents the object's name.
  dataObjectAttributeIds?: string[];
  /**
   * Applies to ALL selected attributes for this link target.
   * - data: render as read-only data
   * - input: render as input form controls
   */
  dataObjectAttributeMode?: ExpandedGridAttributeRenderMode;
  /**
   * If set, this grid node is auto-managed by a direct child node of the expanded node
   * (identified by its linked data object id). While the child exists+linked, the
   * grid node should be treated as "locked" (non-deletable).
   */
  sourceChildDataObjectId?: string;
  /**
   * If set, this grid node is created/managed by a Flow-tab reference.
   * It should be treated as locked until the reference is removed.
   */
  sourceFlowNodeId?: string;
  // Relationship semantics relative to the parent expanded node's data object (if any)
  relationKind?: ExpandedGridRelationKind;
  relationCardinality?: ExpandedGridRelationCardinality;
  gridX: number;
  gridY: number;
  gridWidth: number;
  gridHeight: number;
}

export interface ExpandedGridNodeRuntime extends ExpandedGridNodePersisted {
  id: string; // runtime-only UI id; never persisted
}

export type ExpandedGridSource = 'runningNumber' | 'legacyNodeId' | 'none';

export type ExpandedGridUiType =
  | 'content'
  | 'list'
  | 'button'
  | 'navOut'
  | 'filter'
  | 'tabs'
  | 'wizard'
  | 'sideNav'
  | 'dropdown'
  | 'collapsible'
  | 'text';

export type ExpandedGridTextVariant =
  | 'h1'
  | 'h2'
  | 'h3'
  | 'h4'
  | 'h5'
  | 'h6'
  | 'normal'
  | 'small';

export type ExpandedGridTextAlign = 'left' | 'center' | 'right';

export type ExpandedGridAttributeRenderMode = 'data' | 'input';

export type ExpandedGridUiItem = {
  id: string;
  label: string;
  icon?: string;
  dataObjectId?: string;
  dataObjectAttributeIds?: string[];
  dataObjectAttributeMode?: ExpandedGridAttributeRenderMode;
};

export type ExpandedGridUiTab = {
  id: string;
  label: string;
  icon?: string;
  items?: ExpandedGridUiItem[];
  dataObjectId?: string;
  dataObjectAttributeIds?: string[];
  dataObjectAttributeMode?: ExpandedGridAttributeRenderMode;
};

export type ExpandedGridUiSection = {
  id: string;
  label: string;
  icon?: string;
  items?: ExpandedGridUiItem[];
  collapsedByDefault?: boolean;
  dataObjectId?: string;
  dataObjectAttributeIds?: string[];
  dataObjectAttributeMode?: ExpandedGridAttributeRenderMode;
};

export type ExpandedGridRelationKind = 'attribute' | 'relation' | 'none';
export type ExpandedGridRelationCardinality = 'one' | 'oneToMany' | 'manyToMany';

function getExpandedGridBlockRegex(key: string): RegExp {
  return new RegExp(String.raw`\`\`\`expanded-grid-${key}\n([\s\S]*?)\n\`\`\``);
}

function getExpandedGridFullBlockRegex(key: string): RegExp {
  return new RegExp(String.raw`\`\`\`expanded-grid-${key}\n[\s\S]*?\n\`\`\``);
}

function makeRuntimeNodes(loaded: unknown, runningNumber: number): { nodes: ExpandedGridNodeRuntime[]; hadPersistedIds: boolean; hadMissingKeys: boolean } {
  if (!Array.isArray(loaded)) return { nodes: [], hadPersistedIds: false, hadMissingKeys: false };
  let hadPersistedIds = false;
  let hadMissingKeys = false;

  const sanitizeIcon = (x: unknown): string | undefined => (typeof x === 'string' && x.trim().length ? x : undefined);
  const sanitizeLabel = (x: unknown): string => (typeof x === 'string' ? x.trim() : '');
  const sanitizeId = (x: unknown, fallback: string): string => {
    const s = typeof x === 'string' ? x.trim() : '';
    return s.length ? s : fallback;
  };
  const readItems = (raw: unknown, fallbackPrefix: string): ExpandedGridUiItem[] | undefined => {
    if (!Array.isArray(raw)) return undefined;
    const items = (raw as unknown[]).map((it, idx) => {
      const rec = it as Record<string, unknown>;
      const label = sanitizeLabel(rec?.label);
      if (!label) return null;
      return {
        id: sanitizeId(rec?.id, `${fallbackPrefix}-item-${idx + 1}`),
        label,
        icon: sanitizeIcon(rec?.icon),
        dataObjectId: typeof rec?.dataObjectId === 'string' ? (rec.dataObjectId as string) : undefined,
        dataObjectAttributeIds: Array.isArray(rec?.dataObjectAttributeIds)
          ? (rec.dataObjectAttributeIds as unknown[])
              .map((x) => (typeof x === 'string' ? x.trim() : ''))
              .filter(Boolean)
          : undefined,
        dataObjectAttributeMode:
          typeof rec?.dataObjectAttributeMode === 'string' && (rec.dataObjectAttributeMode === 'data' || rec.dataObjectAttributeMode === 'input')
            ? (rec.dataObjectAttributeMode as ExpandedGridAttributeRenderMode)
            : undefined,
      } satisfies ExpandedGridUiItem;
    }).filter(notNull);
    return items.length ? items : undefined;
  };
  const readTabs = (raw: unknown, fallbackPrefix: string): ExpandedGridUiTab[] | undefined => {
    if (!Array.isArray(raw)) return undefined;
    const tabs = (raw as unknown[]).map((t, idx) => {
      const rec = t as Record<string, unknown>;
      const label = sanitizeLabel(rec?.label);
      if (!label) return null;
      const id = sanitizeId(rec?.id, `${fallbackPrefix}-tab-${idx + 1}`);
      return {
        id,
        label,
        icon: sanitizeIcon(rec?.icon),
        items: readItems(rec?.items, `${fallbackPrefix}-${id}`),
        dataObjectId: typeof rec?.dataObjectId === 'string' ? (rec.dataObjectId as string) : undefined,
        dataObjectAttributeIds: Array.isArray(rec?.dataObjectAttributeIds)
          ? (rec.dataObjectAttributeIds as unknown[])
              .map((x) => (typeof x === 'string' ? x.trim() : ''))
              .filter(Boolean)
          : undefined,
        dataObjectAttributeMode:
          typeof rec?.dataObjectAttributeMode === 'string' && (rec.dataObjectAttributeMode === 'data' || rec.dataObjectAttributeMode === 'input')
            ? (rec.dataObjectAttributeMode as ExpandedGridAttributeRenderMode)
            : undefined,
      } satisfies ExpandedGridUiTab;
    }).filter(notNull);
    return tabs.length ? tabs : undefined;
  };
  const readSections = (raw: unknown, fallbackPrefix: string): ExpandedGridUiSection[] | undefined => {
    if (!Array.isArray(raw)) return undefined;
    const sections = (raw as unknown[]).map((s, idx) => {
      const rec = s as Record<string, unknown>;
      const label = sanitizeLabel(rec?.label);
      if (!label) return null;
      const id = sanitizeId(rec?.id, `${fallbackPrefix}-section-${idx + 1}`);
      return {
        id,
        label,
        icon: sanitizeIcon(rec?.icon),
        items: readItems(rec?.items, `${fallbackPrefix}-${id}`),
        collapsedByDefault: typeof rec?.collapsedByDefault === 'boolean' ? (rec.collapsedByDefault as boolean) : undefined,
        dataObjectId: typeof rec?.dataObjectId === 'string' ? (rec.dataObjectId as string) : undefined,
        dataObjectAttributeIds: Array.isArray(rec?.dataObjectAttributeIds)
          ? (rec.dataObjectAttributeIds as unknown[])
              .map((x) => (typeof x === 'string' ? x.trim() : ''))
              .filter(Boolean)
          : undefined,
        dataObjectAttributeMode:
          typeof rec?.dataObjectAttributeMode === 'string' && (rec.dataObjectAttributeMode === 'data' || rec.dataObjectAttributeMode === 'input')
            ? (rec.dataObjectAttributeMode as ExpandedGridAttributeRenderMode)
            : undefined,
      } satisfies ExpandedGridUiSection;
    }).filter(notNull);
    return sections.length ? sections : undefined;
  };

  const nodes = loaded
    .map((raw, idx) => {
      const r = raw as Partial<ExpandedGridNodePersisted> & { id?: unknown };
      if (r && typeof r === 'object' && 'id' in r) hadPersistedIds = true;

      if (
        typeof r.gridX !== 'number' ||
        typeof r.gridY !== 'number' ||
        typeof r.gridWidth !== 'number' ||
        typeof r.gridHeight !== 'number' ||
        typeof r.content !== 'string'
      ) {
        return null;
      }

      const key = typeof r.key === 'string' && r.key.trim().length ? r.key.trim() : '';
      if (!key) hadMissingKeys = true;
      // Deterministic migration key for legacy grids that didn't persist keys.
      // Once auto-migrated, this key will be persisted and remain stable across reloads.
      const stableKey = key || `grid-${runningNumber}-${idx + 1}`;

      const runtime: ExpandedGridNodeRuntime = {
        id: stableKey,
        key: stableKey,
        content: r.content,
        icon: typeof r.icon === 'string' ? r.icon : undefined,
        color: typeof r.color === 'string' ? r.color : undefined,
        uiType: typeof r.uiType === 'string' ? (r.uiType as ExpandedGridUiType) : undefined,
        uiTabs: readTabs((r as unknown as Record<string, unknown>).uiTabs, stableKey),
        uiSections: readSections((r as unknown as Record<string, unknown>).uiSections, stableKey),
        textVariant: (() => {
          const rec = r as unknown as Record<string, unknown>;
          const v = typeof rec.textVariant === 'string' ? rec.textVariant : '';
          const allowed: ExpandedGridTextVariant[] = ['h1','h2','h3','h4','h5','h6','normal','small'];
          return allowed.includes(v as ExpandedGridTextVariant) ? (v as ExpandedGridTextVariant) : undefined;
        })(),
        textAlign: (() => {
          const rec = r as unknown as Record<string, unknown>;
          const v = typeof rec.textAlign === 'string' ? rec.textAlign : '';
          const allowed: ExpandedGridTextAlign[] = ['left','center','right'];
          return allowed.includes(v as ExpandedGridTextAlign) ? (v as ExpandedGridTextAlign) : undefined;
        })(),
        dataObjectId: typeof r.dataObjectId === 'string' ? r.dataObjectId : undefined,
        dataObjectAttributeIds: (() => {
          const rec = r as unknown as Record<string, unknown>;
          const raw = rec.dataObjectAttributeIds;
          if (!Array.isArray(raw)) return undefined;
          const ids = (raw as unknown[])
            .map((x) => (typeof x === 'string' ? x.trim() : ''))
            .filter(Boolean);
          return ids.length ? ids : undefined;
        })(),
        dataObjectAttributeMode: (() => {
          const rec = r as unknown as Record<string, unknown>;
          const mode = rec.dataObjectAttributeMode;
          if (mode === 'data' || mode === 'input') return mode as ExpandedGridAttributeRenderMode;
          return undefined;
        })(),
        sourceChildDataObjectId:
          typeof (r as unknown as Record<string, unknown>).sourceChildDataObjectId === 'string'
            ? ((r as unknown as Record<string, unknown>).sourceChildDataObjectId as string)
            : undefined,
        sourceFlowNodeId:
          typeof (r as unknown as Record<string, unknown>).sourceFlowNodeId === 'string'
            ? ((r as unknown as Record<string, unknown>).sourceFlowNodeId as string)
            : undefined,
        relationKind: (() => {
          const rec = r as unknown as Record<string, unknown>;
          return typeof rec.relationKind === 'string' ? (rec.relationKind as ExpandedGridRelationKind) : undefined;
        })(),
        relationCardinality: (() => {
          const rec = r as unknown as Record<string, unknown>;
          return typeof rec.relationCardinality === 'string'
            ? (rec.relationCardinality as ExpandedGridRelationCardinality)
            : undefined;
        })(),
        gridX: r.gridX,
        gridY: r.gridY,
        gridWidth: r.gridWidth,
        gridHeight: r.gridHeight,
      };
      return runtime;
    })
    .filter((n): n is ExpandedGridNodeRuntime => n !== null);

  return { nodes, hadPersistedIds, hadMissingKeys };
}

export function loadExpandedGridNodesFromMarkdown(
  markdown: string,
  runningNumber: number,
  legacyNodeId?: string
): {
  source: ExpandedGridSource;
  nodes: ExpandedGridNodeRuntime[];
  hadPersistedIds: boolean;
  hadMissingKeys: boolean;
} {
  const match = markdown.match(getExpandedGridBlockRegex(String(runningNumber)));
  if (match) {
    try {
      const loaded = JSON.parse(match[1]);
      const { nodes, hadPersistedIds, hadMissingKeys } = makeRuntimeNodes(loaded, runningNumber);
      return { source: 'runningNumber', nodes, hadPersistedIds, hadMissingKeys };
    } catch {
      // ignore parse errors
    }
  }

  if (legacyNodeId) {
    const legacyMatch = markdown.match(getExpandedGridBlockRegex(legacyNodeId));
    if (legacyMatch) {
      try {
        const loaded = JSON.parse(legacyMatch[1]);
        const { nodes, hadPersistedIds, hadMissingKeys } = makeRuntimeNodes(loaded, runningNumber);
        return { source: 'legacyNodeId', nodes, hadPersistedIds, hadMissingKeys };
      } catch {
        // ignore parse errors
      }
    }
  }

  return { source: 'none', nodes: [], hadPersistedIds: false, hadMissingKeys: false };
}

export function saveExpandedGridNodesToMarkdown(
  markdown: string,
  runningNumber: number,
  nodes: ExpandedGridNodeRuntime[],
  legacyNodeIdToRemove?: string
): string {
  const persisted: ExpandedGridNodePersisted[] = nodes.map((n) => ({
    key: n.key,
    content: n.content,
    icon: n.icon,
    color: n.color,
    uiType: n.uiType,
    uiTabs: (n as unknown as Record<string, unknown>).uiTabs as ExpandedGridUiTab[] | undefined,
    uiSections: (n as unknown as Record<string, unknown>).uiSections as ExpandedGridUiSection[] | undefined,
    textVariant: (n as unknown as Record<string, unknown>).textVariant as ExpandedGridTextVariant | undefined,
    textAlign: (n as unknown as Record<string, unknown>).textAlign as ExpandedGridTextAlign | undefined,
    dataObjectId: n.dataObjectId,
    dataObjectAttributeIds: (n as unknown as Record<string, unknown>).dataObjectAttributeIds as string[] | undefined,
    dataObjectAttributeMode: (n as unknown as Record<string, unknown>).dataObjectAttributeMode as ExpandedGridAttributeRenderMode | undefined,
    sourceChildDataObjectId: n.sourceChildDataObjectId,
    sourceFlowNodeId: (n as unknown as Record<string, unknown>).sourceFlowNodeId as string | undefined,
    relationKind: n.relationKind,
    relationCardinality: n.relationCardinality,
    gridX: n.gridX,
    gridY: n.gridY,
    gridWidth: n.gridWidth,
    gridHeight: n.gridHeight,
  }));

  const metadataBlock = `\`\`\`expanded-grid-${runningNumber}\n${JSON.stringify(persisted, null, 2)}\n\`\`\``;
  let newText = markdown;

  const existingMatch = newText.match(getExpandedGridFullBlockRegex(String(runningNumber)));
  if (existingMatch) {
    newText = newText.replace(getExpandedGridFullBlockRegex(String(runningNumber)), metadataBlock);
  } else {
    if (legacyNodeIdToRemove) {
      newText = newText.replace(getExpandedGridFullBlockRegex(legacyNodeIdToRemove), '');
    }

    const separatorIndex = newText.indexOf('\n---\n');
    if (separatorIndex !== -1) {
      newText = newText.slice(0, separatorIndex) + '\n' + metadataBlock + '\n' + newText.slice(separatorIndex);
    } else {
      newText = newText + (newText.endsWith('\n') ? '' : '\n') + '\n' + metadataBlock;
    }
  }

  return newText;
}

export function loadExpandedGridNodesFromDoc(
  doc: Y.Doc,
  runningNumber: number,
  legacyNodeId?: string
) {
  const yText = doc.getText('nexus');
  return loadExpandedGridNodesFromMarkdown(yText.toString(), runningNumber, legacyNodeId);
}

export function saveExpandedGridNodesToDoc(
  doc: Y.Doc,
  runningNumber: number,
  nodes: ExpandedGridNodeRuntime[],
  legacyNodeIdToRemove?: string
): void {
  const yText = doc.getText('nexus');
  const currentText = yText.toString();
  const newText = saveExpandedGridNodesToMarkdown(currentText, runningNumber, nodes, legacyNodeIdToRemove);

  if (newText !== currentText) {
    doc.transact(() => {
      yText.delete(0, yText.length);
      yText.insert(0, newText);
    });
  }
}

