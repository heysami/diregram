'use client';

import type { Editor } from 'tldraw';
import { editableToSvgPath, stringifyEditable, updateRectCornerRoundness, type NxEditablePathData } from '@/components/vision/tldraw/vector-pen/editablePath';

export function RectCornerRoundnessSection({
  editor,
  shape,
  editable,
  selectedNodeId,
  vectorPenActive,
}: {
  editor: Editor;
  shape: any;
  editable: NxEditablePathData | null;
  selectedNodeId: string | null;
  vectorPenActive: boolean;
}) {
  if (!editable || editable.kind !== 'rect') return null;
  if (!selectedNodeId) return null;
  if (vectorPenActive) return null;

  const w = Number(shape?.props?.w || 0) || 0;
  const h = Number(shape?.props?.h || 0) || 0;
  const maxR = Math.max(0, Math.min(w, h) / 2);
  const nodes = Array.isArray((editable as any)?.nodes) ? ((editable as any).nodes as any[]) : [];
  const n = nodes.find((x) => String(x?.id || '') === String(selectedNodeId));
  if (!n) return null;

  const x = Number(n.x || 0) || 0;
  const y = Number(n.y || 0) || 0;
  const dTL = (x - 0) ** 2 + (y - 0) ** 2;
  const dTR = (x - w) ** 2 + (y - 0) ** 2;
  const dBR = (x - w) ** 2 + (y - h) ** 2;
  const dBL = (x - 0) ** 2 + (y - h) ** 2;
  const corner: 'tl' | 'tr' | 'br' | 'bl' =
    dTL <= dTR && dTL <= dBR && dTL <= dBL ? 'tl' : dTR <= dBR && dTR <= dBL ? 'tr' : dBR <= dBL ? 'br' : 'bl';
  const label = corner.toUpperCase();
  const val =
    corner === 'tl'
      ? Number((editable as any).rTL || 0) || 0
      : corner === 'tr'
        ? Number((editable as any).rTR || 0) || 0
        : corner === 'br'
          ? Number((editable as any).rBR || 0) || 0
          : Number((editable as any).rBL || 0) || 0;

  const apply = (nextR: number) => {
    const next = updateRectCornerRoundness(editable as any, w, h, corner, nextR);
    const nextD = editableToSvgPath(next as any);
    try {
      editor.updateShapes([{ id: shape.id, type: shape.type, props: { nxEdit: stringifyEditable(next as any), d: nextD } } as any]);
    } catch {
      // ignore
    }
  };

  return (
    <div className="nx-vsp-section">
      <div className="nx-vsp-title">Vector</div>
      <div className="nx-vsp-group">
        <div className="nx-vsp-stack">
          <div className="nx-vsp-row">
            <div className="nx-vsp-icon">R</div>
            <div className="text-xs opacity-70 w-[92px]">Roundness ({label})</div>
            <input
              className="flex-1"
              type="range"
              min={0}
              max={maxR}
              step={1}
              value={val}
              onChange={(e) => apply(Number((e.target as any).value || 0) || 0)}
            />
            <input
              className="nx-vsp-number w-[76px]"
              type="number"
              min={0}
              max={maxR}
              value={val}
              onChange={(e) => apply(Number((e.target as any).value || 0) || 0)}
              title="Corner radius"
            />
          </div>
          <div className="text-[11px] opacity-70">Click a corner node to edit that corner’s roundness. Use Vector Pen to add nodes.</div>
        </div>
      </div>
    </div>
  );
}

