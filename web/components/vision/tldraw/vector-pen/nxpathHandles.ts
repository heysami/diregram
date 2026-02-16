'use client';

import type { Editor } from 'tldraw';
import type { TLHandle, TLHandleDragInfo } from '@tldraw/editor';
import { getIndices } from '@tldraw/utils';
import { editableToSvgPath, stringifyEditable, tryParseEditable, type NxBezierNode } from '@/components/vision/tldraw/vector-pen/editablePath';
import { getSelectedNodeId, isVectorPenActive } from '@/components/vision/tldraw/vector-pen/meta';

export function getNxpathEditableHandles(editor: Editor | null | undefined, shape: any): TLHandle[] {
  const data = tryParseEditable(shape?.props?.nxEdit);
  if (!data) return [];
  const nodes = Array.isArray(data.nodes) ? (data.nodes as NxBezierNode[]) : [];
  if (nodes.length < 2) return [];

  const penActive = editor ? isVectorPenActive(editor) : false;
  const selectedNodeId = editor ? getSelectedNodeId(editor) : null;

  const closed = !!(data as any).closed;
  const handles: TLHandle[] = [];
  const createCount = closed ? nodes.length : Math.max(0, nodes.length - 1);
  const idxs = getIndices(nodes.length * 3 + createCount);
  let k = 0;

  for (const n of nodes) {
    handles.push({ id: `a:${n.id}`, type: 'vertex', index: idxs[k++] as any, x: n.x, y: n.y, canSnap: true } as any);
    const showCtrls = penActive || (selectedNodeId && selectedNodeId === String(n.id));
    if (showCtrls) {
      const eps = 0.0001;
      const inDistinct = Math.hypot(Number(n.inX) - Number(n.x), Number(n.inY) - Number(n.y)) > eps;
      const outDistinct = Math.hypot(Number(n.outX) - Number(n.x), Number(n.outY) - Number(n.y)) > eps;
      if (inDistinct) handles.push({ id: `i:${n.id}`, type: 'vertex', index: idxs[k++] as any, x: n.inX, y: n.inY, canSnap: false } as any);
      else k++;
      if (outDistinct) handles.push({ id: `o:${n.id}`, type: 'vertex', index: idxs[k++] as any, x: n.outX, y: n.outY, canSnap: false } as any);
      else k++;
    } else {
      k += 2;
    }
  }

  if (penActive) {
    const last = closed ? nodes.length : nodes.length - 1;
    for (let idx = 0; idx < last; idx++) {
      const a = nodes[idx];
      const b = nodes[(idx + 1) % nodes.length];
      const mx = (Number(a.x || 0) + Number(b.x || 0)) / 2;
      const my = (Number(a.y || 0) + Number(b.y || 0)) / 2;
      handles.push({
        id: `c:${a.id}:${b.id}`,
        type: 'create',
        index: idxs[k++] as any,
        x: mx,
        y: my,
        canSnap: true,
      } as any);
    }
  }

  return handles;
}

export function onNxpathEditableHandleDrag(editor: Editor | null | undefined, shape: any, info: TLHandleDragInfo<any>) {
  const data = tryParseEditable(shape?.props?.nxEdit);
  if (!data) return;
  const nodes = Array.isArray(data.nodes) ? (data.nodes as NxBezierNode[]) : [];
  if (nodes.length < 2) return;

  const h = (info as any)?.handle as any;
  const hid = String(h?.id || '');
  const hx = Number(h?.x);
  const hy = Number(h?.y);
  if (!Number.isFinite(hx) || !Number.isFinite(hy)) return;

  const findIdx = (id: string) => nodes.findIndex((n) => String(n.id) === id);

  if (hid.startsWith('a:')) {
    const id = hid.slice(2);
    const i = findIdx(id);
    if (i < 0) return;
    const n = nodes[i];
    const dx = hx - Number(n.x || 0);
    const dy = hy - Number(n.y || 0);
    n.x = hx;
    n.y = hy;
    n.inX = Number(n.inX || 0) + dx;
    n.inY = Number(n.inY || 0) + dy;
    n.outX = Number(n.outX || 0) + dx;
    n.outY = Number(n.outY || 0) + dy;
  } else if (hid.startsWith('i:')) {
    const id = hid.slice(2);
    const i = findIdx(id);
    if (i < 0) return;
    nodes[i].inX = hx;
    nodes[i].inY = hy;
  } else if (hid.startsWith('o:')) {
    const id = hid.slice(2);
    const i = findIdx(id);
    if (i < 0) return;
    nodes[i].outX = hx;
    nodes[i].outY = hy;
  } else if (hid.startsWith('c:')) {
    // Create handle inserts a node between adjacent anchors.
    const rest = hid.slice(2);
    const [beforeId, afterId] = rest.split(':');
    if (!beforeId || !afterId) return;
    const bi = findIdx(beforeId);
    const ai = findIdx(afterId);
    if (bi < 0 || ai < 0) return;

    const nextIdx = (bi + 1) % nodes.length;
    const stillAdjacent = String(nodes[nextIdx]?.id || '') === afterId;
    if (stillAdjacent) {
      const newId = `n_${Math.random().toString(36).slice(2, 10)}`;
      const nn: NxBezierNode = { id: newId, x: hx, y: hy, inX: hx, inY: hy, outX: hx, outY: hy };
      nodes.splice(bi + 1, 0, nn);
    }
  } else {
    return;
  }

  const nextData: any = { ...data, nodes };
  const nextD = editableToSvgPath(nextData as any) || String(shape?.props?.d || '');
  return { props: { nxEdit: stringifyEditable(nextData as any), d: nextD } } as any;
}

