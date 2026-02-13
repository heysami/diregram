import { useMemo } from 'react';
import * as Y from 'yjs';
import type { NexusNode } from '@/types/nexus';
import type { NexusDataObject } from '@/lib/data-object-storage';
import { loadDataObjectAttributes, type DataObjectAttribute } from '@/lib/data-object-attributes';

export type LockedStatusDimensionInfo = {
  key: string; // dimension key shown in conditional UI
  objectId: string;
  objectName: string;
  attrId: string;
  attrName: string;
  values: string[];
};

/**
 * Conditional node: attach a linked Data Object's status attribute(s) as locked dimensions.
 *
 * Persistence:
 * - Stored on the hub line as `<!-- dostatus:attr-1,attr-2 -->`.
 * - Parsed into `hubNode.metadata.doStatusAttrIds`.
 */
export function useLinkedDataObjectStatusDimensions(opts: {
  doc: Y.Doc;
  hubNode: NexusNode;
  dataObjects: NexusDataObject[];
  baseKeyValues: Map<string, string[]>;
}) {
  const { doc, hubNode, dataObjects, baseKeyValues } = opts;

  const linkedDo = useMemo(() => {
    const doId = (hubNode.dataObjectId || '').trim();
    if (!doId) return null;
    return dataObjects.find((o) => o.id === doId) || null;
  }, [dataObjects, hubNode.dataObjectId]);

  const statusAttrs = useMemo(() => {
    if (!linkedDo) return [] as Array<DataObjectAttribute & { type: 'status' }>;
    const attrs = loadDataObjectAttributes(linkedDo.data);
    return attrs.filter((a): a is DataObjectAttribute & { type: 'status' } => (a as any).type === 'status');
  }, [linkedDo]);

  const linkedAttrIds = useMemo(() => {
    const ids = (hubNode.metadata as any)?.doStatusAttrIds as string[] | undefined;
    return Array.isArray(ids) ? ids.filter(Boolean) : [];
  }, [hubNode.metadata]);

  const lockedByKey = useMemo(() => {
    const byKey = new Map<string, LockedStatusDimensionInfo>();
    if (!linkedDo) return byKey;
    const byId = new Map(statusAttrs.map((a) => [a.id, a]));
    linkedAttrIds.forEach((attrId) => {
      const a = byId.get(attrId);
      if (!a) return;
      const key = (a.name || '').trim() || attrId;
      const values = Array.isArray((a as any).values) ? ((a as any).values as string[]) : [];
      byKey.set(key, {
        key,
        objectId: linkedDo.id,
        objectName: linkedDo.name,
        attrId,
        attrName: a.name,
        values: values.slice(),
      });
    });
    return byKey;
  }, [linkedDo, statusAttrs, linkedAttrIds]);

  const lockedKeys = useMemo(() => new Set(Array.from(lockedByKey.keys())), [lockedByKey]);

  const effectiveKeyValues = useMemo(() => {
    const m = new Map<string, string[]>(baseKeyValues);
    lockedByKey.forEach((info, key) => {
      m.set(key, info.values.slice());
    });
    return m;
  }, [baseKeyValues, lockedByKey]);

  const setLinkedAttrIds = (nextIds: string[]) => {
    if (!linkedDo) return;
    const yText = doc.getText('nexus');
    const lines = yText.toString().split('\n');
    const idx = hubNode.lineIndex;
    if (idx < 0 || idx >= lines.length) return;
    const prev = lines[idx] || '';
    const without = prev.replace(/<!--\s*dostatus:[^>]*\s*-->/i, '').trimEnd();
    const cleanedIds = Array.from(new Set(nextIds.map((s) => s.trim()).filter(Boolean)));
    const suffix = cleanedIds.length ? ` <!-- dostatus:${cleanedIds.join(',')} -->` : '';
    const nextLine = without + suffix;
    if (nextLine === prev) return;
    doc.transact(() => {
      lines[idx] = nextLine;
      yText.delete(0, yText.length);
      yText.insert(0, lines.join('\n'));
    });
  };

  const addLockedStatusDimension = (attrId: string) => {
    if (linkedAttrIds.includes(attrId)) return;
    setLinkedAttrIds([...linkedAttrIds, attrId]);
  };

  const removeLockedStatusDimension = (attrId: string) => {
    if (!linkedAttrIds.includes(attrId)) return;
    setLinkedAttrIds(linkedAttrIds.filter((id) => id !== attrId));
  };

  return {
    linkedDo,
    statusAttrs,
    linkedAttrIds,
    lockedByKey,
    lockedKeys,
    effectiveKeyValues,
    addLockedStatusDimension,
    removeLockedStatusDimension,
  };
}

