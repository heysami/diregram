'use client';

import type { Editor } from 'tldraw';
import type { TLShapeId } from '@tldraw/tlschema';
import {
  AlignHorizontalJustifyCenter,
  AlignHorizontalJustifyEnd,
  AlignHorizontalJustifyStart,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignVerticalJustifyStart,
  Group,
  LayoutGrid,
  PenTool,
  ScanLine,
  SquaresIntersect,
  SquaresSubtract,
  SquaresUnite,
  Ungroup,
} from 'lucide-react';
import { getParentSpacePoint, getShapePageBounds } from '@/components/vision/tldraw/fx/proxy/proxyBounds';
import { createAutoLayoutGroupFromSelection } from '@/components/vision/tldraw/layout/nxLayoutCreateAutoGroup';

export function ActionsSection({
  editor,
  selectionCount,
  showUngroup,
  showFlatten,
  showVectorize,
  showUnframe,
  onUngroup,
  onUnframe,
  onVectorize,
  onUnion,
  onSubtract,
  onIntersect,
  onFlatten,
  embedded,
}: {
  editor: Editor;
  selectionCount: number;
  showUngroup: boolean;
  showFlatten: boolean;
  showVectorize: boolean;
  showUnframe: boolean;
  onUngroup: () => void;
  onUnframe: () => void;
  onVectorize: () => void;
  onUnion: () => void;
  onSubtract: () => void;
  onIntersect: () => void;
  onFlatten: () => void;
  /** Render without outer section wrapper/title (for grouping under another header). */
  embedded?: boolean;
}) {
  const canGroup = selectionCount >= 2;
  const canBoolean = selectionCount >= 2;
  const canAlign = selectionCount >= 2;
  const canMakeLayout = selectionCount >= 1;
  const hasAny =
    canGroup || canMakeLayout || showUngroup || showUnframe || showVectorize || canAlign || canBoolean || showFlatten;
  if (!hasAny) return null;

  type Bounds = { x: number; y: number; w: number; h: number };
  const asBounds = (b: any): Bounds | null => {
    if (!b) return null;
    const x = Number(b.x ?? b.minX ?? 0);
    const y = Number(b.y ?? b.minY ?? 0);
    const w = Number(b.w ?? b.width ?? 0);
    const h = Number(b.h ?? b.height ?? 0);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(w) || !Number.isFinite(h)) return null;
    if (w <= 0 || h <= 0) return null;
    return { x, y, w, h };
  };

  type AlignMode = 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom';
  const alignSelection = (mode: AlignMode) => {
    try {
      const ids = editor.getSelectedShapeIds() as TLShapeId[];
      if (!ids || ids.length < 2) return;

      const selectionBounds =
        asBounds((editor as any).getShapesPageBounds?.(ids as any)) || asBounds((editor as any).getSelectionPageBounds?.()) || null;
      if (!selectionBounds) return;

      const updates: any[] = [];
      for (const id of ids) {
        if (!id) continue;
        try {
          if ((editor as any).isShapeOrAncestorLocked?.(id as any)) continue;
        } catch {
          // ignore
        }

        const shape: any = editor.getShape(id as any);
        if (!shape) continue;
        const b = getShapePageBounds(editor, id as any);
        if (!b) continue;

        let dx = 0;
        let dy = 0;
        if (mode === 'left') dx = selectionBounds.x - b.x;
        else if (mode === 'hcenter') dx = selectionBounds.x + selectionBounds.w / 2 - (b.x + b.w / 2);
        else if (mode === 'right') dx = selectionBounds.x + selectionBounds.w - (b.x + b.w);
        else if (mode === 'top') dy = selectionBounds.y - b.y;
        else if (mode === 'vcenter') dy = selectionBounds.y + selectionBounds.h / 2 - (b.y + b.h / 2);
        else if (mode === 'bottom') dy = selectionBounds.y + selectionBounds.h - (b.y + b.h);

        if (!dx && !dy) continue;

        // Convert page-space delta into parent-space delta (works for nested shapes too).
        const p0 = getParentSpacePoint(editor, id as any, { x: b.x, y: b.y });
        const p1 = getParentSpacePoint(editor, id as any, { x: b.x + dx, y: b.y + dy });
        const ddx = Number(p1.x - p0.x);
        const ddy = Number(p1.y - p0.y);
        if (!Number.isFinite(ddx) || !Number.isFinite(ddy)) continue;

        updates.push({
          id,
          type: shape.type,
          x: Number(shape.x || 0) + ddx,
          y: Number(shape.y || 0) + ddy,
        });
      }

      if (!updates.length) return;
      editor.updateShapes(updates as any);
    } catch {
      // ignore
    }
  };

  const body = (
    <div className="nx-vsp-group">
      <div className="nx-vsp-actionsGrid">
        {canGroup ? (
          <span className="nx-tooltip" data-tooltip="Group">
            <button
              type="button"
              className="nx-tlui-squarebtn"
              onClick={() => {
                try {
                  const ids = editor.getSelectedShapeIds();
                  if (ids.length >= 2) editor.groupShapes(ids);
                } catch {
                  // ignore
                }
              }}
              aria-label="Group selection"
            >
              <Group size={16} />
            </button>
          </span>
        ) : null}

        {canMakeLayout ? (
          <span className="nx-tooltip" data-tooltip="Auto layout group">
            <button
              type="button"
              className="nx-tlui-squarebtn"
              onClick={() => {
                try {
                  const ids = (editor.getSelectedShapeIds() as any[]).filter(Boolean) as TLShapeId[];
                  createAutoLayoutGroupFromSelection(editor, ids);
                } catch {
                  // ignore
                }
              }}
              aria-label="Auto layout group selection"
            >
              <LayoutGrid size={16} />
            </button>
          </span>
        ) : null}

        {showUngroup ? (
          <span className="nx-tooltip" data-tooltip="Ungroup">
            <button
              type="button"
              className="nx-tlui-squarebtn"
              onClick={() => {
                onUngroup();
              }}
              aria-label="Ungroup selection"
            >
              <Ungroup size={16} />
            </button>
          </span>
        ) : null}

        {showUnframe ? (
          <span className="nx-tooltip" data-tooltip="Unframe">
            <button
              type="button"
              className="nx-tlui-squarebtn"
              onClick={() => {
                onUnframe();
              }}
              aria-label="Unframe selection"
            >
              <Ungroup size={16} />
            </button>
          </span>
        ) : null}

        {canAlign ? (
          <>
            <span className="nx-tooltip" data-tooltip="Align left">
              <button
                type="button"
                className="nx-tlui-squarebtn"
                onClick={() => alignSelection('left')}
                aria-label="Align left"
              >
                <AlignHorizontalJustifyStart size={16} />
              </button>
            </span>
            <span className="nx-tooltip" data-tooltip="Align center">
              <button
                type="button"
                className="nx-tlui-squarebtn"
                onClick={() => alignSelection('hcenter')}
                aria-label="Align center"
              >
                <AlignHorizontalJustifyCenter size={16} />
              </button>
            </span>
            <span className="nx-tooltip" data-tooltip="Align right">
              <button
                type="button"
                className="nx-tlui-squarebtn"
                onClick={() => alignSelection('right')}
                aria-label="Align right"
              >
                <AlignHorizontalJustifyEnd size={16} />
              </button>
            </span>

            <span className="nx-tooltip" data-tooltip="Align top">
              <button
                type="button"
                className="nx-tlui-squarebtn"
                onClick={() => alignSelection('top')}
                aria-label="Align top"
              >
                <AlignVerticalJustifyStart size={16} />
              </button>
            </span>
            <span className="nx-tooltip" data-tooltip="Align middle">
              <button
                type="button"
                className="nx-tlui-squarebtn"
                onClick={() => alignSelection('vcenter')}
                aria-label="Align middle"
              >
                <AlignVerticalJustifyCenter size={16} />
              </button>
            </span>
            <span className="nx-tooltip" data-tooltip="Align bottom">
              <button
                type="button"
                className="nx-tlui-squarebtn"
                onClick={() => alignSelection('bottom')}
                aria-label="Align bottom"
              >
                <AlignVerticalJustifyEnd size={16} />
              </button>
            </span>
          </>
        ) : null}

        {showVectorize ? (
          <span className="nx-tooltip" data-tooltip="Convert to vector (points)">
            <button
              type="button"
              className="nx-tlui-squarebtn"
              onClick={() => {
                onVectorize();
              }}
              aria-label="Convert selection to vector points"
            >
              <PenTool size={16} />
            </button>
          </span>
        ) : null}

        {canBoolean ? (
          <>
            <span className="nx-tooltip" data-tooltip="Union">
              <button type="button" className="nx-tlui-squarebtn" onClick={onUnion} aria-label="Union">
                <SquaresUnite size={16} />
              </button>
            </span>
            <span className="nx-tooltip" data-tooltip="Subtract">
              <button type="button" className="nx-tlui-squarebtn" onClick={onSubtract} aria-label="Subtract">
                <SquaresSubtract size={16} />
              </button>
            </span>
            <span className="nx-tooltip" data-tooltip="Intersect">
              <button type="button" className="nx-tlui-squarebtn" onClick={onIntersect} aria-label="Intersect">
                <SquaresIntersect size={16} />
              </button>
            </span>
          </>
        ) : null}

        {showFlatten ? (
          <span className="nx-tooltip" data-tooltip="Flatten">
            <button type="button" className="nx-tlui-squarebtn" onClick={onFlatten} aria-label="Flatten">
              <ScanLine size={16} />
            </button>
          </span>
        ) : null}
      </div>
    </div>
  );

  if (embedded) return body;
  return (
    <div className="nx-vsp-section">
      <div className="nx-vsp-title">Actions</div>
      {body}
    </div>
  );
}

