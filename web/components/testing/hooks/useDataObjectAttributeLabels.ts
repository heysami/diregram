'use client';

import { useMemo } from 'react';
import type * as Y from 'yjs';
import { loadDataObjects } from '@/lib/data-object-storage';
import { loadDataObjectAttributes } from '@/lib/data-object-attributes';
import { OBJECT_NAME_ATTR_ID } from '@/lib/data-object-attribute-ids';

export type GetDataObjectAttributeLabel = (dataObjectId: string, attributeId: string) => string;

export function useDataObjectAttributeLabels(doc: Y.Doc): {
  getDataObjectAttributeLabel: GetDataObjectAttributeLabel;
} {
  const dataObjectById = useMemo(() => {
    const store = loadDataObjects(doc);
    const map = new Map<string, { id: string; name: string; data: unknown }>();
    store.objects.forEach((o) => map.set(o.id, o));
    return map;
  }, [doc]);

  const dataObjectAttrNameByObjectId = useMemo(() => {
    const out = new Map<string, Map<string, string>>();
    dataObjectById.forEach((obj, doid) => {
      const m = new Map<string, string>();
      m.set(OBJECT_NAME_ATTR_ID, 'Object name');
      loadDataObjectAttributes(obj.data).forEach((a) => m.set(a.id, a.name));
      out.set(doid, m);
    });
    return out;
  }, [dataObjectById]);

  const getDataObjectAttributeLabel: GetDataObjectAttributeLabel = (dataObjectId, attributeId) => {
    const doid = (dataObjectId || '').trim();
    const aid = (attributeId || '').trim();
    if (!doid || !aid) return aid;
    return dataObjectAttrNameByObjectId.get(doid)?.get(aid) || aid;
  };

  return { getDataObjectAttributeLabel };
}

