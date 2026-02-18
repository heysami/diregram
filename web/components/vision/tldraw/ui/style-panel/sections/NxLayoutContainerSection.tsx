'use client';

import type { Editor } from 'tldraw';
import { RefreshCw } from 'lucide-react';
import { NxFillStackSection, NxStrokeStackSection } from '@/components/vision/tldraw/ui/style-panel/sections/NxPaintStacksSection';
import { NxRectCornersSection } from '@/components/vision/tldraw/ui/style-panel/sections/NxRectSections';
import { makeDefaultFillLayer, makeDefaultStrokeLayer, serializeFillLayers, serializeStrokeLayers } from '@/components/vision/tldraw/paint/nxPaintLayers';
import { readNxLayoutChildMeta } from '@/components/vision/tldraw/layout/nxLayoutMeta';
import { touchNxLayoutAutoRefresh } from '@/components/vision/tldraw/layout/nxLayoutRefresh';
import { ensureParentAxisFixedForFill } from '@/components/vision/tldraw/layout/nxLayoutFillConflict';

function clamp(v: number, lo: number, hi: number) {
  if (!Number.isFinite(v)) return lo;
  return Math.max(lo, Math.min(hi, v));
}

export function NxLayoutContainerSection({
  editor,
  shape,
  inParent,
  hideLayout,
  onActivateFillHandles,
  onActivateStrokeHandles,
}: {
  editor: Editor;
  shape: any;
  /** If this nxlayout is itself inside another nxlayout, provide the parent for "in parent" sizing. */
  inParent?: any | null;
  /** For "core frames" that use nxlayout rendering but shouldn't expose layout controls. */
  hideLayout?: boolean;
  onActivateFillHandles: (layerId: string) => void;
  onActivateStrokeHandles: (layerId: string) => void;
}) {
  if (!shape || String(shape.type || '') !== 'nxlayout') return null;

  const childIds: any[] = (() => {
    try {
      return ((editor as any).getSortedChildIdsForParent?.(shape.id as any) || []).filter(Boolean);
    } catch {
      return [];
    }
  })();

  const childMetas = childIds
    .map((id) => {
      try {
        const s: any = editor.getShape(id as any);
        if (!s) return null;
        return readNxLayoutChildMeta(s.meta);
      } catch {
        return null;
      }
    })
    .filter(Boolean) as any[];

  const anyFillX = childMetas.some((m) => m.sizeX === 'fill');
  const anyFillY = childMetas.some((m) => m.sizeY === 'fill');

  const inParentMeta = readNxLayoutChildMeta((shape as any).meta);
  const inParentMode = inParent && String(inParent?.props?.layoutMode || 'manual') === 'auto' ? 'auto' : 'manual';
  const inParentSizeX = inParent && String(inParent?.props?.sizeX || 'fixed') === 'hug' ? 'hug' : 'fixed';
  const inParentSizeY = inParent && String(inParent?.props?.sizeY || 'fixed') === 'hug' ? 'hug' : 'fixed';
  const nestedInAutoParent = Boolean(inParent && inParentMode === 'auto');

  const update = (patch: any) => {
    try {
      editor.updateShapes([{ id: shape.id, type: shape.type, props: { ...(shape.props || {}), ...patch } } as any]);
    } catch {
      // ignore
    }
  };

  const updateInParentChildMeta = (patch: any) => {
    try {
      const prev = ((shape as any).meta && typeof (shape as any).meta === 'object' ? (shape as any).meta : {}) as any;
      const nextChildMeta = { ...(prev.nxLayoutChild || {}), ...patch };
      editor.updateShapes([
        {
          id: shape.id,
          type: shape.type,
          meta: {
            ...(prev || {}),
            nxLayoutChild: nextChildMeta,
          },
        } as any,
      ]);
    } catch {
      // ignore
    }
  };

  const layoutMode = String(shape.props?.layoutMode || 'manual') === 'auto' ? 'auto' : 'manual';
  const direction = String(shape.props?.direction || 'vertical') === 'horizontal' ? 'horizontal' : 'vertical';
  const alignCrossRaw = String(shape.props?.alignCross || 'start');
  const alignCross = (alignCrossRaw === 'center' || alignCrossRaw === 'end' ? alignCrossRaw : 'start') as 'start' | 'center' | 'end';
  const sizeX = String(shape.props?.sizeX || 'fixed') === 'hug' ? 'hug' : 'fixed';
  const sizeY = String(shape.props?.sizeY || 'fixed') === 'hug' ? 'hug' : 'fixed';
  const gap = Number(shape.props?.gap ?? 12) || 0;
  const paddingTop = Number(shape.props?.paddingTop ?? 16) || 0;
  const paddingRight = Number(shape.props?.paddingRight ?? 16) || 0;
  const paddingBottom = Number(shape.props?.paddingBottom ?? 16) || 0;
  const paddingLeft = Number(shape.props?.paddingLeft ?? 16) || 0;

  const fillsJson = String(shape.props?.fills || '') || undefined;
  const strokesJson = String(shape.props?.strokes || '') || undefined;

  return (
    <>
      {!hideLayout ? (
        <div className="nx-vsp-section">
          <div className="flex items-center justify-between">
            <div className="nx-vsp-title">Layout</div>
            <span className="nx-tooltip" data-tooltip={layoutMode === 'auto' ? 'Refresh auto layout' : 'Refresh (switch to Auto layout first)'}>
              <button
                type="button"
                className="nx-tlui-squarebtn"
                onClick={() => touchNxLayoutAutoRefresh(editor, shape.id)}
                aria-label="Refresh auto layout"
                disabled={layoutMode !== 'auto'}
                title="Refresh auto layout"
              >
                <RefreshCw size={16} />
              </button>
            </span>
          </div>
          <div className="nx-vsp-group">
            <div className="nx-vsp-stack">
              <div className="nx-vsp-row">
                <div className="nx-vsp-icon">L</div>
                <select
                  className="nx-vsp-select flex-1"
                  value={layoutMode}
                  onChange={(e) => update({ layoutMode: String(e.target.value || 'manual') === 'auto' ? 'auto' : 'manual' })}
                  title="Layout mode"
                >
                  <option value="manual">Manual (constraints)</option>
                  <option value="auto">Auto layout</option>
                </select>
              </div>

              {layoutMode === 'auto' ? (
                <>
                  <div className="nx-vsp-row">
                    <div className="nx-vsp-icon">Dir</div>
                    <select
                      className="nx-vsp-select flex-1"
                      value={direction}
                      onChange={(e) =>
                        update({ direction: String(e.target.value || 'vertical') === 'horizontal' ? 'horizontal' : 'vertical' })
                      }
                      title="Direction"
                    >
                      <option value="vertical">Vertical</option>
                      <option value="horizontal">Horizontal</option>
                    </select>

                    <div className="nx-vsp-hint">Gap</div>
                    <input
                      className="nx-vsp-number w-[96px]"
                      type="number"
                      min={0}
                      max={4096}
                      value={Math.round(gap)}
                      onChange={(e) => update({ gap: clamp(Number(e.target.value || 0), 0, 4096) })}
                      title="Gap"
                    />
                  </div>

                  <div className="nx-vsp-row">
                    <div className="nx-vsp-icon">Pad</div>
                    <input
                      className="nx-vsp-number w-[76px]"
                      type="number"
                      min={0}
                      max={4096}
                      value={Math.round(paddingTop)}
                      onChange={(e) => update({ paddingTop: clamp(Number(e.target.value || 0), 0, 4096) })}
                      title="Padding top"
                    />
                    <input
                      className="nx-vsp-number w-[76px]"
                      type="number"
                      min={0}
                      max={4096}
                      value={Math.round(paddingRight)}
                      onChange={(e) => update({ paddingRight: clamp(Number(e.target.value || 0), 0, 4096) })}
                      title="Padding right"
                    />
                    <input
                      className="nx-vsp-number w-[76px]"
                      type="number"
                      min={0}
                      max={4096}
                      value={Math.round(paddingBottom)}
                      onChange={(e) => update({ paddingBottom: clamp(Number(e.target.value || 0), 0, 4096) })}
                      title="Padding bottom"
                    />
                    <input
                      className="nx-vsp-number w-[76px]"
                      type="number"
                      min={0}
                      max={4096}
                      value={Math.round(paddingLeft)}
                      onChange={(e) => update({ paddingLeft: clamp(Number(e.target.value || 0), 0, 4096) })}
                      title="Padding left"
                    />
                  </div>

                  <div className="nx-vsp-row">
                    <div className="nx-vsp-icon">A</div>
                    <select
                      className="nx-vsp-select flex-1"
                      value={alignCross}
                      onChange={(e) => update({ alignCross: String(e.target.value || 'start') })}
                      title="Cross-axis alignment"
                    >
                      {direction === 'vertical' ? (
                        <>
                          <option value="start">Align left</option>
                          <option value="center">Align middle</option>
                          <option value="end">Align right</option>
                        </>
                      ) : (
                        <>
                          <option value="start">Align top</option>
                          <option value="center">Align middle</option>
                          <option value="end">Align bottom</option>
                        </>
                      )}
                    </select>
                  </div>
                </>
              ) : null}

              {!nestedInAutoParent ? (
                layoutMode === 'auto' ? (
                  <div className="nx-vsp-row">
                    <div className="nx-vsp-icon">W</div>
                    <select
                      className="nx-vsp-select flex-1"
                      value={sizeX}
                      onChange={(e) => update({ sizeX: String(e.target.value || 'fixed') })}
                      title="Width sizing"
                    >
                      <option value="fixed">Fixed</option>
                      <option value="hug" disabled={anyFillX}>
                        Hug contents
                      </option>
                    </select>
                    <div className="nx-vsp-icon">H</div>
                    <select
                      className="nx-vsp-select flex-1"
                      value={sizeY}
                      onChange={(e) => update({ sizeY: String(e.target.value || 'fixed') })}
                      title="Height sizing"
                    >
                      <option value="fixed">Fixed</option>
                      <option value="hug" disabled={anyFillY}>
                        Hug contents
                      </option>
                    </select>
                  </div>
                ) : null
              ) : (
                <div className="nx-vsp-row">
                  <div className="nx-vsp-icon">W</div>
                  <select
                    className="nx-vsp-select flex-1"
                    value={inParentMeta.sizeX === 'fill' ? 'fill' : sizeX === 'hug' ? 'hug' : 'fixed'}
                    onChange={(e) => {
                      const next = String(e.target.value || 'fixed');
                      if (next === 'hug' && layoutMode !== 'auto') return;
                      if (next === 'fill') {
                        // Fill container (as child)
                        ensureParentAxisFixedForFill(editor, inParent, 'x');
                        update({ sizeX: 'fixed' });
                        updateInParentChildMeta({ sizeX: 'fill' });
                        return;
                      }
                      if (next === 'hug') {
                        // Hug contents (internal)
                        updateInParentChildMeta({ sizeX: 'fixed' });
                        update({ sizeX: 'hug' });
                        return;
                      }
                      // Fixed
                      updateInParentChildMeta({ sizeX: 'fixed' });
                      update({ sizeX: 'fixed' });
                    }}
                    title="Width sizing"
                  >
                    <option value="fixed">Fixed</option>
                    <option value="hug" disabled={layoutMode !== 'auto' || anyFillX}>
                      Hug contents
                    </option>
                    <option value="fill">Fill container</option>
                  </select>
                  <div className="nx-vsp-icon">H</div>
                  <select
                    className="nx-vsp-select flex-1"
                    value={inParentMeta.sizeY === 'fill' ? 'fill' : sizeY === 'hug' ? 'hug' : 'fixed'}
                    onChange={(e) => {
                      const next = String(e.target.value || 'fixed');
                      if (next === 'hug' && layoutMode !== 'auto') return;
                      if (next === 'fill') {
                        ensureParentAxisFixedForFill(editor, inParent, 'y');
                        update({ sizeY: 'fixed' });
                        updateInParentChildMeta({ sizeY: 'fill' });
                        return;
                      }
                      if (next === 'hug') {
                        updateInParentChildMeta({ sizeY: 'fixed' });
                        update({ sizeY: 'hug' });
                        return;
                      }
                      updateInParentChildMeta({ sizeY: 'fixed' });
                      update({ sizeY: 'fixed' });
                    }}
                    title="Height sizing"
                  >
                    <option value="fixed">Fixed</option>
                    <option value="hug" disabled={layoutMode !== 'auto' || anyFillY}>
                      Hug contents
                    </option>
                    <option value="fill">Fill container</option>
                  </select>
              </div>
              )}

              {layoutMode === 'auto' && (anyFillX || anyFillY) ? (
                <div className="nx-vsp-hint">
                  Hug sizing is disabled on an axis if any child is set to Fill on that axis (prevents a layout conflict).
                </div>
              ) : null}

              {nestedInAutoParent && (inParentSizeX === 'hug' || inParentSizeY === 'hug') ? (
                <div className="nx-vsp-hint">If you choose Fill, we’ll switch the parent from Hug to Fixed on that axis.</div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      <NxFillStackSection
        title="Fill"
        icon="F"
        fillsJson={fillsJson}
        legacySolid={String(shape.props?.fill || '#ffffffff')}
        legacyMode={String(shape.props?.fillMode || 'solid') as any}
        legacyStopsJson={String(shape.props?.fillStops || '')}
        legacyPattern={String(shape.props?.fillPattern || 'stripes') as any}
        legacyAngle={Number(shape.props?.fillAngle ?? 45) || 45}
        onConvertFromLegacy={() =>
          update({
            fills: serializeFillLayers([
              makeDefaultFillLayer({
                mode: String(shape.props?.fillMode || 'solid') as any,
                solid: String(shape.props?.fill || '#ffffffff'),
                stops: String(shape.props?.fillStops || ''),
                pattern: String(shape.props?.fillPattern || 'stripes') as any,
                angle: Number(shape.props?.fillAngle ?? 45) || 45,
              } as any),
            ]),
          })
        }
        onChangeFillsJson={(json) => update({ fills: json })}
        onActivateGradientHandles={onActivateFillHandles}
      />

      <NxStrokeStackSection
        title="Outline"
        icon="O"
        strokesJson={strokesJson}
        legacySolid={String(shape.props?.stroke || '#111111ff')}
        legacyMode={String(shape.props?.strokeMode || 'solid') as any}
        legacyStopsJson={String(shape.props?.strokeStops || '')}
        legacyPattern={String(shape.props?.strokePattern || 'dots') as any}
        legacyAngle={Number(shape.props?.strokeAngle ?? 45) || 45}
        legacyWidth={Number(shape.props?.strokeWidth ?? 2) || 2}
        strokeStacksDisabledReason={null}
        onConvertFromLegacy={() =>
          update({
            strokes: serializeStrokeLayers([
              makeDefaultStrokeLayer({
                mode: String(shape.props?.strokeMode || 'solid') as any,
                solid: String(shape.props?.stroke || '#111111ff'),
                stops: String(shape.props?.strokeStops || ''),
                pattern: String(shape.props?.strokePattern || 'dots') as any,
                angle: Number(shape.props?.strokeAngle ?? 45) || 45,
                width: Number(shape.props?.strokeWidth ?? 2) || 2,
              } as any),
            ]),
          })
        }
        onChangeStrokesJson={(json) => update({ strokes: json })}
        onActivateGradientHandles={onActivateStrokeHandles}
      />

      <NxRectCornersSection
        radiusUniform={!!shape.props?.radiusUniform}
        radius={Number(shape.props?.radius ?? 0) || 0}
        rtl={Number(shape.props?.radiusTL ?? shape.props?.radius ?? 0) || 0}
        rtr={Number(shape.props?.radiusTR ?? shape.props?.radius ?? 0) || 0}
        rbr={Number(shape.props?.radiusBR ?? shape.props?.radius ?? 0) || 0}
        rbl={Number(shape.props?.radiusBL ?? shape.props?.radius ?? 0) || 0}
        onSetUniformRadius={(r) => update({ radiusUniform: true, radius: r, radiusTL: r, radiusTR: r, radiusBR: r, radiusBL: r })}
        onSetCorners={(next) =>
          update({
            radiusUniform: !!next.uniform,
            radius: next.uniform ? next.rtl : Number(shape.props?.radius ?? 0) || 0,
            radiusTL: next.rtl,
            radiusTR: next.rtr,
            radiusBR: next.rbr,
            radiusBL: next.rbl,
          })
        }
      />
    </>
  );
}

