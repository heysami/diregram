'use client';

import { Fragment } from 'react';
import { Rectangle2d, ShapeUtil, T, TLBaseShape } from 'tldraw';
import type { TLHandle, TLHandleDragInfo } from '@tldraw/editor';
import { getNxpathEditableHandles, onNxpathEditableHandleDrag } from '@/components/vision/tldraw/vector-pen';
import { shouldSuppressVectorSourceRender } from '@/components/vision/tldraw/fx/sourceSuppression';
import { getVectorShapeMaskDef } from '@/components/vision/tldraw/fx/vectorShapeMask';
import { getPaintDefs, paintUrl, safeSvgId, type PaintMode, type PatternKind } from '@/components/vision/tldraw/paint/paintDefs';
import { parseStopsJson } from '@/components/vision/tldraw/lib/gradient-stops';
import {
  makeDefaultFillLayer,
  makeDefaultStrokeLayer,
  parseFillLayers,
  parseStopsJsonLoose,
  parseStrokeLayers,
  serializeFillLayers,
  serializeStrokeLayers,
} from '@/components/vision/tldraw/paint/nxPaintLayers';
import { hex8ToRgbaCss } from '@/components/vision/tldraw/ui/style-panel/color-utils';

export type NXPathShape = TLBaseShape<
  'nxpath',
  {
    w: number;
    h: number;
    /** SVG path data in local (0,0)-(w,h) coordinates */
    d: string;
    /** Optional: preserve SVG viewBox origin for imported paths. */
    vbX?: number;
    vbY?: number;
    /** JSON string of NxFillLayer[] (layer stack). */
    fills?: string;
    /** JSON string of NxStrokeLayer[] (layer stack). */
    strokes?: string;
    // Paint model (shared with nxrect/nxtext)
    fillMode?: PaintMode;
    fill: string; // solid
    fillA?: string;
    fillB?: string;
    fillAngle?: number;
    fillStops?: string; // JSON GradientStop[]
    fillPattern?: PatternKind;

    strokeMode?: PaintMode;
    stroke: string; // solid
    strokeA?: string;
    strokeB?: string;
    strokeAngle?: number;
    strokeStops?: string; // JSON GradientStop[]
    strokePattern?: PatternKind;

    strokeWidth: number;
    /** Optional legacy (v1) gradient props (kept for backward compat). */
    fillKind?: 'solid' | 'linear' | 'radial';
    strokeKind?: 'solid' | 'linear' | 'radial';
    /** Optional: editable bezier path model (JSON). When present, we show point + bezier handles. */
    nxEdit?: string;

    // Gradient direction handles (shared with nxrect/nxtext)
    gx0?: number;
    gy0?: number;
    gx1?: number;
    gy1?: number;
    fillGx0?: number;
    fillGy0?: number;
    fillGx1?: number;
    fillGy1?: number;
    strokeGx0?: number;
    strokeGy0?: number;
    strokeGx1?: number;
    strokeGy1?: number;
  }
>;

// NOTE: tldraw's ShapeUtil is typed against the app's TLShape union. For a local, app-only custom
// shape we keep the runtime behavior correct and loosen the generic type to avoid wiring a full
// global TLShapeMap augmentation.
export class NXPathShapeUtil extends ShapeUtil<any> {
  static override type = 'nxpath' as const;

  static override props = {
    w: T.number,
    h: T.number,
    d: T.string,
    vbX: T.optional(T.number),
    vbY: T.optional(T.number),
    fills: T.optional(T.string),
    strokes: T.optional(T.string),
    fillMode: T.optional(T.literalEnum('solid', 'linear', 'radial', 'pattern')),
    fill: T.string,
    fillA: T.optional(T.string),
    fillB: T.optional(T.string),
    fillAngle: T.optional(T.number),
    fillStops: T.optional(T.string),
    fillPattern: T.optional(T.literalEnum('stripes', 'dots', 'checker')),

    strokeMode: T.optional(T.literalEnum('solid', 'linear', 'radial', 'pattern')),
    stroke: T.string,
    strokeA: T.optional(T.string),
    strokeB: T.optional(T.string),
    strokeAngle: T.optional(T.number),
    strokeStops: T.optional(T.string),
    strokePattern: T.optional(T.literalEnum('stripes', 'dots', 'checker')),

    strokeWidth: T.number,
    fillKind: T.optional(T.literalEnum('solid', 'linear', 'radial')),
    strokeKind: T.optional(T.literalEnum('solid', 'linear', 'radial')),
    nxEdit: T.optional(T.string),

    gx0: T.optional(T.number),
    gy0: T.optional(T.number),
    gx1: T.optional(T.number),
    gy1: T.optional(T.number),
    fillGx0: T.optional(T.number),
    fillGy0: T.optional(T.number),
    fillGx1: T.optional(T.number),
    fillGy1: T.optional(T.number),
    strokeGx0: T.optional(T.number),
    strokeGy0: T.optional(T.number),
    strokeGx1: T.optional(T.number),
    strokeGy1: T.optional(T.number),
  };

  override getDefaultProps(): NXPathShape['props'] {
    return {
      w: 100,
      h: 100,
      d: '',
      fills: serializeFillLayers([
        makeDefaultFillLayer({
          mode: 'solid',
          solid: '#111111ff',
          stops: JSON.stringify([
            { offset: 0, color: '#111111ff' },
            { offset: 1, color: '#ffffffff' },
          ]),
          pattern: 'stripes',
          angle: 45,
          gx0: 0,
          gy0: 0,
          gx1: 1,
          gy1: 0,
        }),
      ]),
      strokes: serializeStrokeLayers([
        makeDefaultStrokeLayer({
          mode: 'solid',
          solid: 'transparent',
          stops: JSON.stringify([
            { offset: 0, color: '#999999ff' },
            { offset: 1, color: '#ffffffff' },
          ]),
          pattern: 'dots',
          angle: 45,
          width: 1,
          align: 'center',
          dash: { kind: 'solid' },
          cap: 'round',
          join: 'round',
          gx0: 0,
          gy0: 0,
          gx1: 1,
          gy1: 0,
        } as any),
      ]),
      fillMode: 'solid',
      fill: '#111111ff',
      fillA: '#111111ff',
      fillB: '#ffffffff',
      fillAngle: 45,
      fillStops: JSON.stringify([
        { offset: 0, color: '#111111ff' },
        { offset: 1, color: '#ffffffff' },
      ]),
      fillPattern: 'stripes',

      strokeMode: 'solid',
      stroke: 'transparent',
      strokeA: '#999999ff',
      strokeB: '#ffffffff',
      strokeAngle: 45,
      strokeStops: JSON.stringify([
        { offset: 0, color: '#999999ff' },
        { offset: 1, color: '#ffffffff' },
      ]),
      strokePattern: 'dots',
      strokeWidth: 1,

      gx0: 0,
      gy0: 0,
      gx1: 1,
      gy1: 0,
      fillGx0: 0,
      fillGy0: 0,
      fillGx1: 1,
      fillGy1: 0,
      strokeGx0: 0,
      strokeGy0: 0,
      strokeGx1: 1,
      strokeGy1: 0,
    };
  }

  override getGeometry(shape: NXPathShape) {
    return new Rectangle2d({
      width: Math.max(1, shape.props.w || 1),
      height: Math.max(1, shape.props.h || 1),
      isFilled: true,
    });
  }

  override component(shape: NXPathShape) {
    // When fx is active, the raster proxy is the visible representation.
    // Keep the source shape selectable/deletable, but don't double-render it.
    try {
      if (shouldSuppressVectorSourceRender((shape as any).meta)) return null;
    } catch {
      // ignore
    }
    const w = Math.max(1, shape.props.w || 1);
    const h = Math.max(1, shape.props.h || 1);
    const vbX = Number.isFinite(shape.props.vbX) ? Number(shape.props.vbX) : 0;
    const vbY = Number.isFinite(shape.props.vbY) ? Number(shape.props.vbY) : 0;
    const dTransform = vbX || vbY ? `translate(${-vbX} ${-vbY})` : undefined;
    const sid = safeSvgId(String(shape.id || 'nxpath'));
    const d = String(shape.props.d || '');
    const isClosed = /[zZ]\s*$/.test(d.trim());

    const vectorMask = getVectorShapeMaskDef({ editor: (this as any).editor || null, targetShape: shape, targetSid: sid });

    const fillLayers = parseFillLayers(shape.props.fills);
    const strokeLayers = parseStrokeLayers(shape.props.strokes);
    const fillStackActive = fillLayers !== null;
    const strokeStackActive = strokeLayers !== null;
    const hasLayerStacks = fillStackActive || strokeStackActive;

    // Prefer the shared paint model; fall back to legacy v1 props if present.
    const fillMode: PaintMode =
      (shape.props.fillMode as any) ||
      (shape.props.fillKind === 'linear' ? 'linear' : shape.props.fillKind === 'radial' ? 'radial' : 'solid');
    const strokeMode: PaintMode =
      (shape.props.strokeMode as any) ||
      (shape.props.strokeKind === 'linear' ? 'linear' : shape.props.strokeKind === 'radial' ? 'radial' : 'solid');

    const fillSolidRaw = shape.props.fill || 'transparent';
    const strokeSolidRaw = shape.props.stroke || 'transparent';
    const fillSolid = hex8ToRgbaCss(fillSolidRaw);
    const strokeSolid = hex8ToRgbaCss(strokeSolidRaw);
    const fillA = (shape.props.fillA || fillSolidRaw) as string;
    const fillB = (shape.props.fillB || '#ffffff') as string;
    const strokeA = (shape.props.strokeA || strokeSolidRaw) as string;
    const strokeB = (shape.props.strokeB || '#ffffff') as string;

    const fillStops =
      fillMode === 'pattern'
        ? [
            { offset: 0, color: String(fillA || '#000000') },
            { offset: 1, color: String(fillB || '#ffffff') },
          ]
        : parseStopsJson(shape.props.fillStops, fillA, fillB);
    const strokeStops =
      strokeMode === 'pattern'
        ? [
            { offset: 0, color: String(strokeA || '#000000') },
            { offset: 1, color: String(strokeB || '#ffffff') },
          ]
        : parseStopsJson(shape.props.strokeStops, strokeA, strokeB);

    const fillAngle = Number.isFinite(shape.props.fillAngle) ? Number(shape.props.fillAngle) : 45;
    const strokeAngle = Number.isFinite(shape.props.strokeAngle) ? Number(shape.props.strokeAngle) : 45;
    const fillPattern = (shape.props.fillPattern || 'stripes') as PatternKind;
    const strokePattern = (shape.props.strokePattern || 'dots') as PatternKind;

    const legacyGx0 = shape.props.gx0;
    const legacyGy0 = shape.props.gy0;
    const legacyGx1 = shape.props.gx1;
    const legacyGy1 = shape.props.gy1;

    const fillDef = getPaintDefs({
      sid,
      mode: fillMode,
      stops: fillStops as any,
      angle: fillAngle,
      pattern: fillPattern,
      kind: 'fill',
      gx0: shape.props.fillGx0 ?? legacyGx0,
      gy0: shape.props.fillGy0 ?? legacyGy0,
      gx1: shape.props.fillGx1 ?? legacyGx1,
      gy1: shape.props.fillGy1 ?? legacyGy1,
    });
    const strokeDef = getPaintDefs({
      sid,
      mode: strokeMode,
      stops: strokeStops as any,
      angle: strokeAngle,
      pattern: strokePattern,
      kind: 'stroke',
      gx0: shape.props.strokeGx0 ?? legacyGx0,
      gy0: shape.props.strokeGy0 ?? legacyGy0,
      gx1: shape.props.strokeGx1 ?? legacyGx1,
      gy1: shape.props.strokeGy1 ?? legacyGy1,
    });

    const fillPaint = fillMode === 'solid' ? fillSolid : paintUrl('fill', sid);
    const strokePaint = strokeMode === 'solid' ? strokeSolid : paintUrl('stroke', sid);

    if (hasLayerStacks) {
      const enabledFills = fillStackActive ? (fillLayers || []).filter((l) => l && (l as any).enabled !== false) : [];
      const enabledStrokes = strokeStackActive ? (strokeLayers || []).filter((l) => l && (l as any).enabled !== false) : [];

      const defs: any[] = [];
      const extraMasks: any[] = [];

      const legacyGx0 = shape.props.gx0;
      const legacyGy0 = shape.props.gy0;
      const legacyGx1 = shape.props.gx1;
      const legacyGy1 = shape.props.gy1;

      if (!fillStackActive && fillMode !== 'solid' && fillDef) defs.push(<Fragment key="def-fill-legacy">{fillDef}</Fragment>);
      if (!strokeStackActive && strokeMode !== 'solid' && strokeDef) defs.push(<Fragment key="def-stroke-legacy">{strokeDef}</Fragment>);

      for (const layer of enabledFills) {
        const layerId = String((layer as any).id || 'layer');
        const mode = String((layer as any).mode || 'solid') as PaintMode;
        if (mode === 'solid') continue;
        const stops = parseStopsJsonLoose((layer as any).stops) || (fillStops as any);
        const def = getPaintDefs({
          sid,
          layerId,
          mode,
          stops: stops as any,
          angle: Number.isFinite((layer as any).angle) ? Number((layer as any).angle) : fillAngle,
          pattern: ((layer as any).pattern || fillPattern) as any,
          kind: 'fill',
          gx0: (layer as any).gx0 ?? (shape.props.fillGx0 ?? legacyGx0),
          gy0: (layer as any).gy0 ?? (shape.props.fillGy0 ?? legacyGy0),
          gx1: (layer as any).gx1 ?? (shape.props.fillGx1 ?? legacyGx1),
          gy1: (layer as any).gy1 ?? (shape.props.fillGy1 ?? legacyGy1),
        });
        if (def) defs.push(<Fragment key={`def-fill-${layerId}`}>{def}</Fragment>);
      }

      for (const layer of enabledStrokes) {
        const mode = String((layer as any).mode || 'solid') as PaintMode;
        const layerId = String((layer as any).id || 'layer');
        if (mode !== 'solid') {
          const stops = parseStopsJsonLoose((layer as any).stops) || (strokeStops as any);
          const def = getPaintDefs({
            sid,
            layerId,
            mode,
            stops: stops as any,
            angle: Number.isFinite((layer as any).angle) ? Number((layer as any).angle) : strokeAngle,
            pattern: ((layer as any).pattern || strokePattern) as any,
            kind: 'stroke',
            gx0: (layer as any).gx0 ?? (shape.props.strokeGx0 ?? legacyGx0),
            gy0: (layer as any).gy0 ?? (shape.props.strokeGy0 ?? legacyGy0),
            gx1: (layer as any).gx1 ?? (shape.props.strokeGx1 ?? legacyGx1),
            gy1: (layer as any).gy1 ?? (shape.props.strokeGy1 ?? legacyGy1),
          });
          if (def) defs.push(<Fragment key={`def-stroke-${layerId}`}>{def}</Fragment>);
        }

        if (isClosed && String((layer as any).align || 'center') === 'outside') {
          extraMasks.push(
            <mask key={`m-${layerId}`} id={`${sid}__strokeOutside__${safeSvgId(layerId)}`} maskUnits="userSpaceOnUse">
              <rect x={-w * 2} y={-h * 2} width={w * 5} height={h * 5} fill="white" />
              <path d={d} fill="black" transform={dTransform} />
            </mask>,
          );
        }
      }

      const dashToSvg = (dash: any, strokeW: number) => {
        const kind = String(dash?.kind || 'solid');
        if (kind === 'solid') return { dasharray: undefined as any, dashoffset: undefined as any };
        if (kind === 'dotted') {
          const a = Math.max(1, Math.round(strokeW));
          const b = Math.max(2, Math.round(strokeW * 2));
          return { dasharray: `${a} ${b}`, dashoffset: undefined as any };
        }
        if (kind === 'dashed') {
          const dl = Number.isFinite(dash?.dashLength) ? Math.max(0.5, Number(dash.dashLength)) : 6;
          const gl = Number.isFinite(dash?.gapLength) ? Math.max(0.5, Number(dash.gapLength)) : 4;
          return { dasharray: `${dl} ${gl}`, dashoffset: undefined as any };
        }
        if (kind === 'custom') {
          const arr = Array.isArray(dash?.array) ? dash.array : [];
          const dasharray = arr.length ? arr.map((n: any) => Math.max(0, Number(n) || 0)).join(' ') : '6 4';
          const dashoffset = Number.isFinite(dash?.offset) ? String(Number(dash.offset)) : undefined;
          return { dasharray, dashoffset };
        }
        return { dasharray: undefined as any, dashoffset: undefined as any };
      };

      const needsClip = isClosed && strokeStackActive && enabledStrokes.some((l) => String((l as any)?.align || 'center') === 'inside');

      return (
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: 'block', overflow: 'visible' }}>
          {(defs.length || extraMasks.length || needsClip || vectorMask) ? (
            <defs>
              {defs}
              {needsClip ? (
                <clipPath id={`${sid}__clip`}>
                  <path d={d} transform={dTransform} />
                </clipPath>
              ) : null}
              {extraMasks}
              {vectorMask ? vectorMask.defs : null}
            </defs>
          ) : null}

          <g mask={vectorMask ? vectorMask.maskAttr : undefined}>
            {/* Fill stack */}
            {fillStackActive ? (
              enabledFills.length ? (
                enabledFills.map((layer) => {
                  const id = String((layer as any).id || 'layer');
                  const mode = String((layer as any).mode || 'solid') as PaintMode;
                  const solidRaw = String((layer as any).solid || fillSolidRaw || 'transparent');
                  const paint = mode === 'solid' ? hex8ToRgbaCss(solidRaw) : paintUrl('fill', sid, id);
                  return <path key={`f-${id}`} d={d} fill={paint} stroke="none" transform={dTransform} />;
                })
              ) : null
            ) : (
              <path d={d} fill={fillPaint} stroke="none" transform={dTransform} />
            )}

            {/* Stroke stack */}
            {strokeStackActive ? (
              enabledStrokes.length ? (
                enabledStrokes.map((layer) => {
                const id = String((layer as any).id || 'layer');
                const mode = String((layer as any).mode || 'solid') as PaintMode;
                const solidRaw = String((layer as any).solid || strokeSolidRaw || 'transparent');
                const paint = mode === 'solid' ? hex8ToRgbaCss(solidRaw) : paintUrl('stroke', sid, id);
                const width = Math.max(0, Number((layer as any).width ?? shape.props.strokeWidth ?? 1));
                const align = isClosed ? String((layer as any).align || 'center') : 'center';
                const cap = String((layer as any).cap || 'round');
                const join = String((layer as any).join || 'round');
                const dash = (layer as any).dash || { kind: 'solid' };
                const { dasharray, dashoffset } = dashToSvg(dash, width);
                const renderWidth = align === 'center' ? width : width * 2;
                const p = (
                  <path
                    d={d}
                    fill="none"
                    stroke={paint}
                    strokeWidth={renderWidth}
                    strokeLinejoin={join as any}
                    strokeLinecap={cap as any}
                    strokeDasharray={dasharray}
                    strokeDashoffset={dashoffset}
                    transform={dTransform}
                  />
                );
                if (align === 'inside') {
                  return (
                    <g key={`s-${id}`} clipPath={`url(#${sid}__clip)`}>
                      {p}
                    </g>
                  );
                }
                if (align === 'outside') {
                  return (
                    <g key={`s-${id}`} mask={`url(#${sid}__strokeOutside__${safeSvgId(id)})`}>
                      {p}
                    </g>
                  );
                }
                return <g key={`s-${id}`}>{p}</g>;
                })
              ) : null
            ) : (
              <path
                d={d}
                fill={fillPaint}
                stroke={strokePaint}
                strokeWidth={shape.props.strokeWidth || 1}
                strokeLinejoin="round"
                strokeLinecap="round"
                transform={dTransform}
              />
            )}
          </g>
        </svg>
      );
    }

    return (
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: 'block', overflow: 'visible' }}>
        {(fillMode !== 'solid' || strokeMode !== 'solid' || vectorMask) ? (
          <defs>
            {fillDef}
            {strokeDef}
            {vectorMask ? vectorMask.defs : null}
          </defs>
        ) : null}
        <g mask={vectorMask ? vectorMask.maskAttr : undefined}>
          <path
            d={d}
            fill={fillPaint}
            stroke={strokePaint}
            strokeWidth={shape.props.strokeWidth || 1}
            strokeLinejoin="round"
            strokeLinecap="round"
            transform={dTransform}
          />
        </g>
      </svg>
    );
  }

  override getHandles(shape: any): TLHandle[] {
    return getNxpathEditableHandles(this.editor as any, shape);
  }

  override onHandleDrag(shape: any, info: TLHandleDragInfo<any>) {
    return onNxpathEditableHandleDrag(this.editor as any, shape, info);
  }

  override indicator(shape: NXPathShape) {
    const w = Math.max(1, shape.props.w || 1);
    const h = Math.max(1, shape.props.h || 1);
    return <rect width={w} height={h} fill="none" stroke="var(--color-selected)" />;
  }
}

