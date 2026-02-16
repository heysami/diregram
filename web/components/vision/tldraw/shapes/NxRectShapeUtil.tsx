'use client';

import { Fragment } from 'react';
import { BaseBoxShapeUtil, type TLHandle, type TLHandleDragInfo } from '@tldraw/editor';
import { T, TLBaseShape } from 'tldraw';
import { parseStopsJson, type GradientStop } from '@/components/vision/tldraw/lib/gradient-stops';
import { shouldSuppressVectorSourceRender } from '@/components/vision/tldraw/fx/sourceSuppression';
import { getPaintDefs, paintUrl, safeSvgId, type PaintMode, type PatternKind } from '@/components/vision/tldraw/paint/paintDefs';
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

// PaintMode/PatternKind are shared in `paintDefs` so all shapes behave consistently.

export type NxRectShape = TLBaseShape<
  'nxrect',
  {
    w: number;
    h: number;

    /** JSON string of NxFillLayer[] (layer stack). */
    fills?: string;
    /** JSON string of NxStrokeLayer[] (layer stack). */
    strokes?: string;

    // Fill paint
    fillMode: PaintMode;
    fill: string; // solid
    fillA?: string; // gradient/pattern primary
    fillB?: string; // gradient/pattern secondary
    fillAngle?: number; // linear
    fillStops?: string; // JSON GradientStop[]
    fillPattern?: PatternKind;

    // Stroke paint
    strokeMode: PaintMode;
    stroke: string; // solid
    strokeA?: string;
    strokeB?: string;
    strokeAngle?: number;
    strokeStops?: string; // JSON GradientStop[]
    strokePattern?: PatternKind;

    // Stroke thickness
    strokeUniform: boolean;
    strokeWidth: number;
    strokeTop?: number;
    strokeRight?: number;
    strokeBottom?: number;
    strokeLeft?: number;

    // Corner radii
    radiusUniform: boolean;
    radius: number;
    radiusTL?: number;
    radiusTR?: number;
    radiusBR?: number;
    radiusBL?: number;

    // Optional label rendered inside the rect
    label?: string;
    labelColor?: string;
    labelSize?: number;
    labelAlign?: 'left' | 'center' | 'right';

    // Legacy (shared) direction
    gx0?: number;
    gy0?: number;
    gx1?: number;
    gy1?: number;

    // New: separate fill vs outline directions
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

function clamp(v: number, lo: number, hi: number) {
  if (!Number.isFinite(v)) return lo;
  return Math.max(lo, Math.min(hi, v));
}

function roundedRectPath(w: number, h: number, rtl: number, rtr: number, rbr: number, rbl: number) {
  const tl = clamp(rtl, 0, Math.min(w, h) / 2);
  const tr = clamp(rtr, 0, Math.min(w, h) / 2);
  const br = clamp(rbr, 0, Math.min(w, h) / 2);
  const bl = clamp(rbl, 0, Math.min(w, h) / 2);
  // Path with clockwise arcs
  return [
    `M ${tl},0`,
    `H ${w - tr}`,
    tr ? `A ${tr},${tr} 0 0 1 ${w},${tr}` : `L ${w},0`,
    `V ${h - br}`,
    br ? `A ${br},${br} 0 0 1 ${w - br},${h}` : `L ${w},${h}`,
    `H ${bl}`,
    bl ? `A ${bl},${bl} 0 0 1 0,${h - bl}` : `L 0,${h}`,
    `V ${tl}`,
    tl ? `A ${tl},${tl} 0 0 1 ${tl},0` : `L 0,0`,
    'Z',
  ].join(' ');
}

function safeId(id: string) {
  return safeSvgId(id);
}

// `paintUrl` + `getPaintDefs` are shared via `paintDefs`.

export class NxRectShapeUtil extends BaseBoxShapeUtil<any> {
  static override type = 'nxrect' as const;

  static override props = {
    w: T.number,
    h: T.number,

    fills: T.optional(T.string),
    strokes: T.optional(T.string),

    fillMode: T.literalEnum('solid', 'linear', 'radial', 'pattern'),
    fill: T.string,
    fillA: T.optional(T.string),
    fillB: T.optional(T.string),
    fillAngle: T.optional(T.number),
    fillStops: T.optional(T.string),
    fillPattern: T.optional(T.literalEnum('stripes', 'dots', 'checker')),

    strokeMode: T.literalEnum('solid', 'linear', 'radial', 'pattern'),
    stroke: T.string,
    strokeA: T.optional(T.string),
    strokeB: T.optional(T.string),
    strokeAngle: T.optional(T.number),
    strokeStops: T.optional(T.string),
    strokePattern: T.optional(T.literalEnum('stripes', 'dots', 'checker')),

    strokeUniform: T.boolean,
    strokeWidth: T.number,
    strokeTop: T.optional(T.number),
    strokeRight: T.optional(T.number),
    strokeBottom: T.optional(T.number),
    strokeLeft: T.optional(T.number),

    radiusUniform: T.boolean,
    radius: T.number,
    radiusTL: T.optional(T.number),
    radiusTR: T.optional(T.number),
    radiusBR: T.optional(T.number),
    radiusBL: T.optional(T.number),

    label: T.optional(T.string),
    labelColor: T.optional(T.string),
    labelSize: T.optional(T.number),
    labelAlign: T.optional(T.literalEnum('left', 'center', 'right')),

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

  override getDefaultProps(): NxRectShape['props'] {
    return {
      w: 160,
      h: 100,

      fills: serializeFillLayers([
        makeDefaultFillLayer({
          mode: 'solid',
          solid: '#ffffffff',
          stops: JSON.stringify([
            { offset: 0, color: '#ffffffff' },
            { offset: 1, color: '#111111ff' },
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
          solid: '#111111ff',
          stops: JSON.stringify([
            { offset: 0, color: '#111111ff' },
            { offset: 1, color: '#ffffffff' },
          ]),
          pattern: 'dots',
          angle: 45,
          width: 2,
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
      fill: '#ffffffff',
      fillA: '#ffffffff',
      fillB: '#111111ff',
      fillAngle: 45,
      fillStops: JSON.stringify([
        { offset: 0, color: '#ffffffff' },
        { offset: 1, color: '#111111ff' },
      ]),
      fillPattern: 'stripes',

      strokeMode: 'solid',
      stroke: '#111111ff',
      strokeA: '#111111ff',
      strokeB: '#ffffffff',
      strokeAngle: 45,
      strokeStops: JSON.stringify([
        { offset: 0, color: '#111111ff' },
        { offset: 1, color: '#ffffffff' },
      ]),
      strokePattern: 'dots',

      strokeUniform: true,
      strokeWidth: 2,

      radiusUniform: true,
      radius: 12,

      label: '',
      labelColor: '#111111ff',
      labelSize: 18,
      labelAlign: 'center',

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

  override getHandles(shape: any): TLHandle[] {
    // Do not show default tldraw handles for gradient direction.
    // We render explicit on-canvas handles only when activated from the style panel.
    return [];
  }

  override onHandleDrag(shape: any, info: TLHandleDragInfo<any>) {
    const { handle } = info as any;
    const w = Math.max(1, Number(shape?.props?.w || 1));
    const h = Math.max(1, Number(shape?.props?.h || 1));
    const nx = clamp(Number(handle?.x || 0) / w, 0, 1);
    const ny = clamp(Number(handle?.y || 0) / h, 0, 1);
    if (String(handle?.id) === 'g0') return { props: { gx0: nx, gy0: ny } } as any;
    if (String(handle?.id) === 'g1') return { props: { gx1: nx, gy1: ny } } as any;
    return;
  }

  override component(shape: NxRectShape) {
    try {
      if (shouldSuppressVectorSourceRender((shape as any).meta)) return null;
    } catch {
      // ignore
    }
    const w = Math.max(1, shape.props.w || 1);
    const h = Math.max(1, shape.props.h || 1);
    const sid = safeId(String(shape.id || 'nxrect'));

    const radiusUniform = !!shape.props.radiusUniform;
    const r = clamp(Number(shape.props.radius ?? 0), 0, Math.min(w, h) / 2);
    const rtl = clamp(Number(shape.props.radiusTL ?? r), 0, Math.min(w, h) / 2);
    const rtr = clamp(Number(shape.props.radiusTR ?? r), 0, Math.min(w, h) / 2);
    const rbr = clamp(Number(shape.props.radiusBR ?? r), 0, Math.min(w, h) / 2);
    const rbl = clamp(Number(shape.props.radiusBL ?? r), 0, Math.min(w, h) / 2);
    const pathD = roundedRectPath(w, h, radiusUniform ? r : rtl, radiusUniform ? r : rtr, radiusUniform ? r : rbr, radiusUniform ? r : rbl);

    const fillLayers = parseFillLayers(shape.props.fills);
    const strokeLayers = parseStrokeLayers(shape.props.strokes);
    const fillStackActive = fillLayers !== null;
    const strokeStackActive = strokeLayers !== null;
    const hasLayerStacks = fillStackActive || strokeStackActive;

    const fillMode = (shape.props.fillMode || 'solid') as PaintMode;
    const strokeMode = (shape.props.strokeMode || 'solid') as PaintMode;
    const fillSolidRaw = shape.props.fill || 'transparent';
    const strokeSolidRaw = shape.props.stroke || 'transparent';
    const fillSolid = hex8ToRgbaCss(fillSolidRaw);
    const strokeSolid = hex8ToRgbaCss(strokeSolidRaw);

    const fillA = (shape.props.fillA || fillSolidRaw) as string;
    const fillB = (shape.props.fillB || '#111111') as string;
    const strokeA = (shape.props.strokeA || strokeSolidRaw) as string;
    const strokeB = (shape.props.strokeB || '#111111') as string;

    // For linear/radial: use multi-stop JSON (with A/B fallbacks).
    // For pattern: keep behavior tied to A/B swatches (first/last stop only).
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
    const fillAngle = clamp(Number(shape.props.fillAngle ?? 45), 0, 360);
    const strokeAngle = clamp(Number(shape.props.strokeAngle ?? 45), 0, 360);
    const fillPattern = (shape.props.fillPattern || 'stripes') as PatternKind;
    const strokePattern = (shape.props.strokePattern || 'dots') as PatternKind;

    const fillPaint = fillMode === 'solid' ? fillSolid : paintUrl('fill', sid);
    const strokePaint = strokeMode === 'solid' ? strokeSolid : paintUrl('stroke', sid);

    const strokeUniform = !!shape.props.strokeUniform;
    const strokeWidth = clamp(Number(shape.props.strokeWidth ?? 1), 0, 128);
    const st = clamp(Number(shape.props.strokeTop ?? strokeWidth), 0, 128);
    const sr = clamp(Number(shape.props.strokeRight ?? strokeWidth), 0, 128);
    const sb = clamp(Number(shape.props.strokeBottom ?? strokeWidth), 0, 128);
    const sl = clamp(Number(shape.props.strokeLeft ?? strokeWidth), 0, 128);

    const legacyGx0 = shape.props.gx0;
    const legacyGy0 = shape.props.gy0;
    const legacyGx1 = shape.props.gx1;
    const legacyGy1 = shape.props.gy1;

    const fillDef = getPaintDefs({
      sid,
      mode: fillMode,
      stops: fillStops,
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
      stops: strokeStops,
      angle: strokeAngle,
      pattern: strokePattern,
      kind: 'stroke',
      gx0: shape.props.strokeGx0 ?? legacyGx0,
      gy0: shape.props.strokeGy0 ?? legacyGy0,
      gx1: shape.props.strokeGx1 ?? legacyGx1,
      gy1: shape.props.strokeGy1 ?? legacyGy1,
    });

    const label = String(shape.props.label || '');
    const labelColor = hex8ToRgbaCss(String(shape.props.labelColor || '#111111'));
    const labelSize = clamp(Number(shape.props.labelSize ?? 18), 6, 256);
    const labelAlign = (shape.props.labelAlign || 'center') as 'left' | 'center' | 'right';
    const pad = 10;
    const textAnchor = labelAlign === 'left' ? 'start' : labelAlign === 'right' ? 'end' : 'middle';
    const textX = labelAlign === 'left' ? pad : labelAlign === 'right' ? w - pad : w / 2;

    if (hasLayerStacks) {
      const enabledFills = fillStackActive ? (fillLayers || []).filter((l) => l && (l as any).enabled !== false) : [];
      const enabledStrokes = strokeStackActive ? (strokeLayers || []).filter((l) => l && (l as any).enabled !== false) : [];

      const defs: any[] = [];
      const extraMasks: any[] = [];

      const legacyGx0 = shape.props.gx0;
      const legacyGy0 = shape.props.gy0;
      const legacyGx1 = shape.props.gx1;
      const legacyGy1 = shape.props.gy1;

      // If only one stack is enabled, keep the other side rendering legacy paints (including defs).
      if (!fillStackActive && fillMode !== 'solid' && fillDef) defs.push(<Fragment key="def-fill-legacy">{fillDef}</Fragment>);
      if (!strokeStackActive && strokeMode !== 'solid' && strokeDef) defs.push(<Fragment key="def-stroke-legacy">{strokeDef}</Fragment>);

      for (const layer of enabledFills) {
        const layerId = String((layer as any).id || 'layer');
        const mode = ((layer as any).mode || 'solid') as PaintMode;
        if (mode === 'solid') continue;
        const stops =
          parseStopsJsonLoose((layer as any).stops) ||
          (mode === 'pattern'
            ? [
                { offset: 0, color: String((layer as any).solid || fillA || '#000000') },
                { offset: 1, color: String(fillB || '#ffffff') },
              ]
            : (parseStopsJson(shape.props.fillStops, fillA, fillB) as unknown as GradientStop[]));
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
        const mode = ((layer as any).mode || 'solid') as PaintMode;
        const layerId = String((layer as any).id || 'layer');
        if (mode !== 'solid') {
          const stops =
            parseStopsJsonLoose((layer as any).stops) ||
            (mode === 'pattern'
              ? [
                  { offset: 0, color: String((layer as any).solid || strokeA || '#000000') },
                  { offset: 1, color: String(strokeB || '#ffffff') },
                ]
              : (parseStopsJson(shape.props.strokeStops, strokeA, strokeB) as unknown as GradientStop[]));
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

        if (String((layer as any).align || 'center') === 'outside') {
          extraMasks.push(
            <mask key={`m-${layerId}`} id={`${sid}__strokeOutside__${safeId(layerId)}`} maskUnits="userSpaceOnUse">
              <rect x={-w * 2} y={-h * 2} width={w * 5} height={h * 5} fill="white" />
              <path d={pathD} fill="black" />
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

      return (
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: 'block', overflow: 'visible' }}>
          <defs>
            {defs}
            <clipPath id={`${sid}__clip`}>
              <path d={pathD} />
            </clipPath>
            {extraMasks}
          </defs>

          {/* Fill stack */}
          {fillStackActive ? (
            enabledFills.length ? (
              enabledFills.map((layer) => {
                const id = String((layer as any).id || 'layer');
                const mode = String((layer as any).mode || 'solid') as PaintMode;
                const solidRaw = String((layer as any).solid || fillSolidRaw || 'transparent');
                const paint = mode === 'solid' ? hex8ToRgbaCss(solidRaw) : paintUrl('fill', sid, id);
                return <path key={`f-${id}`} d={pathD} fill={paint} stroke="none" />;
              })
            ) : null
          ) : (
            <path d={pathD} fill={fillPaint} stroke="none" />
          )}

          {/* Stroke stack */}
          {strokeStackActive ? (
            enabledStrokes.length ? (
              enabledStrokes.map((layer) => {
                const id = String((layer as any).id || 'layer');
                const mode = String((layer as any).mode || 'solid') as PaintMode;
                const solidRaw = String((layer as any).solid || strokeSolidRaw || 'transparent');
                const paint = mode === 'solid' ? hex8ToRgbaCss(solidRaw) : paintUrl('stroke', sid, id);
                const width = clamp(Number((layer as any).width ?? strokeWidth), 0, 256);
                const align = String((layer as any).align || 'center') as any;
                const cap = String((layer as any).cap || 'round');
                const join = String((layer as any).join || 'round');
                const dash = (layer as any).dash || { kind: 'solid' };
                const { dasharray, dashoffset } = dashToSvg(dash, width);

                const renderWidth = align === 'center' ? width : width * 2;
                const p = (
                  <path
                    d={pathD}
                    fill="none"
                    stroke={paint}
                    strokeWidth={renderWidth}
                    strokeLinejoin={join as any}
                    strokeLinecap={cap as any}
                    strokeDasharray={dasharray}
                    strokeDashoffset={dashoffset}
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
                    <g key={`s-${id}`} mask={`url(#${sid}__strokeOutside__${safeId(id)})`}>
                      {p}
                    </g>
                  );
                }
                return <g key={`s-${id}`}>{p}</g>;
              })
            ) : null
          ) : strokeUniform ? (
            <path d={pathD} fill="none" stroke={strokePaint} strokeWidth={strokeWidth} strokeLinejoin="round" />
          ) : (
            <g clipPath={`url(#${sid}__clip)`}>
              {/* Border rectangles; clipped to outer rounded rect */}
              {st > 0 ? <rect x={0} y={0} width={w} height={st} fill={strokePaint} /> : null}
              {sb > 0 ? <rect x={0} y={Math.max(0, h - sb)} width={w} height={sb} fill={strokePaint} /> : null}
              {sl > 0 ? <rect x={0} y={0} width={sl} height={h} fill={strokePaint} /> : null}
              {sr > 0 ? <rect x={Math.max(0, w - sr)} y={0} width={sr} height={h} fill={strokePaint} /> : null}
            </g>
          )}

          {label ? (
            <g clipPath={`url(#${sid}__clip)`} pointerEvents="none">
              <text
                x={textX}
                y={h / 2}
                textAnchor={textAnchor as any}
                dominantBaseline="middle"
                fontFamily={'Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif'}
                fontSize={labelSize}
                fill={labelColor}
              >
                {label}
              </text>
            </g>
          ) : null}
        </svg>
      );
    }

    return (
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: 'block', overflow: 'visible' }}>
        <defs>
          {fillDef}
          {strokeDef}
          <clipPath id={`${sid}__clip`}>
            <path d={pathD} />
          </clipPath>
        </defs>

        {/* Fill */}
        <path d={pathD} fill={fillPaint} stroke="none" />

        {/* Stroke */}
        {strokeUniform ? (
          <path d={pathD} fill="none" stroke={strokePaint} strokeWidth={strokeWidth} strokeLinejoin="round" />
        ) : (
          <g clipPath={`url(#${sid}__clip)`}>
            {/* Border rectangles; clipped to outer rounded rect */}
            {st > 0 ? <rect x={0} y={0} width={w} height={st} fill={strokePaint} /> : null}
            {sb > 0 ? <rect x={0} y={Math.max(0, h - sb)} width={w} height={sb} fill={strokePaint} /> : null}
            {sl > 0 ? <rect x={0} y={0} width={sl} height={h} fill={strokePaint} /> : null}
            {sr > 0 ? <rect x={Math.max(0, w - sr)} y={0} width={sr} height={h} fill={strokePaint} /> : null}
          </g>
        )}

        {label ? (
          <g clipPath={`url(#${sid}__clip)`} pointerEvents="none">
            <text
              x={textX}
              y={h / 2}
              textAnchor={textAnchor as any}
              dominantBaseline="middle"
              fontFamily={'Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif'}
              fontSize={labelSize}
              fill={labelColor}
            >
              {label}
            </text>
          </g>
        ) : null}
      </svg>
    );
  }

  override indicator(shape: NxRectShape) {
    const w = Math.max(1, shape.props.w || 1);
    const h = Math.max(1, shape.props.h || 1);
    return <rect width={w} height={h} fill="none" stroke="var(--color-selected)" />;
  }
}

