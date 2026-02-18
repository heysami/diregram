'use client';

import { Fragment } from 'react';
import { BaseBoxShapeUtil } from '@tldraw/editor';
import { T, TLBaseShape } from 'tldraw';
import { parseStopsJson } from '@/components/vision/tldraw/lib/gradient-stops';
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

export type NxLayoutShape = TLBaseShape<
  'nxlayout',
  {
    w: number;
    h: number;

    /** JSON string of NxFillLayer[] (layer stack). */
    fills?: string;
    /** JSON string of NxStrokeLayer[] (layer stack). */
    strokes?: string;

    // Legacy / fallback paint props (match Vision vector shapes)
    fillMode: PaintMode;
    fill: string;
    fillA?: string;
    fillB?: string;
    fillAngle?: number;
    fillStops?: string;
    fillPattern?: PatternKind;

    strokeMode: PaintMode;
    stroke: string;
    strokeA?: string;
    strokeB?: string;
    strokeAngle?: number;
    strokeStops?: string;
    strokePattern?: PatternKind;
    strokeWidth: number;

    // Corner radii
    radiusUniform: boolean;
    radius: number;
    radiusTL?: number;
    radiusTR?: number;
    radiusBR?: number;
    radiusBL?: number;

    // Layout behavior
    layoutMode: 'manual' | 'auto';
    direction: 'horizontal' | 'vertical';
    gap: number;
    paddingTop: number;
    paddingRight: number;
    paddingBottom: number;
    paddingLeft: number;
    alignCross: 'start' | 'center' | 'end' | 'stretch';
    sizeX: 'fixed' | 'hug';
    sizeY: 'fixed' | 'hug';

    // Legacy (shared) direction (kept for consistency with gradient handles codepaths)
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

function clamp(v: number, lo: number, hi: number) {
  if (!Number.isFinite(v)) return lo;
  return Math.max(lo, Math.min(hi, v));
}

function roundedRectPath(w: number, h: number, rtl: number, rtr: number, rbr: number, rbl: number) {
  const tl = clamp(rtl, 0, Math.min(w, h) / 2);
  const tr = clamp(rtr, 0, Math.min(w, h) / 2);
  const br = clamp(rbr, 0, Math.min(w, h) / 2);
  const bl = clamp(rbl, 0, Math.min(w, h) / 2);
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

// NOTE: Like other app-only custom shapes, we keep runtime behavior correct and loosen the generic
// type to avoid wiring global TLDraw type-map augmentation (which otherwise makes `TLShape` unions
// reject `'nxlayout'` at compile time).
export class NxLayoutShapeUtil extends BaseBoxShapeUtil<any> {
  static override type = 'nxlayout' as const;

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
    strokeWidth: T.number,

    radiusUniform: T.boolean,
    radius: T.number,
    radiusTL: T.optional(T.number),
    radiusTR: T.optional(T.number),
    radiusBR: T.optional(T.number),
    radiusBL: T.optional(T.number),

    layoutMode: T.literalEnum('manual', 'auto'),
    direction: T.literalEnum('horizontal', 'vertical'),
    gap: T.number,
    paddingTop: T.number,
    paddingRight: T.number,
    paddingBottom: T.number,
    paddingLeft: T.number,
    alignCross: T.literalEnum('start', 'center', 'end', 'stretch'),
    sizeX: T.literalEnum('fixed', 'hug'),
    sizeY: T.literalEnum('fixed', 'hug'),

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

  override getDefaultProps(): NxLayoutShape['props'] {
    return {
      w: 280,
      h: 200,

      fills: serializeFillLayers([makeDefaultFillLayer({ mode: 'solid', solid: '#ffffffff' })]),
      strokes: serializeStrokeLayers([makeDefaultStrokeLayer({ mode: 'solid', solid: '#999999ff', width: 2 })]),

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
      stroke: '#999999ff',
      strokeA: '#999999ff',
      strokeB: '#ffffffff',
      strokeAngle: 45,
      strokeStops: JSON.stringify([
        { offset: 0, color: '#999999ff' },
        { offset: 1, color: '#ffffffff' },
      ]),
      strokePattern: 'dots',
      strokeWidth: 2,

      radiusUniform: true,
      radius: 12,
      radiusTL: 12,
      radiusTR: 12,
      radiusBR: 12,
      radiusBL: 12,

      layoutMode: 'manual',
      direction: 'vertical',
      gap: 12,
      paddingTop: 16,
      paddingRight: 16,
      paddingBottom: 16,
      paddingLeft: 16,
      alignCross: 'start',
      sizeX: 'fixed',
      sizeY: 'fixed',

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

  override getHandles() {
    // We use custom on-canvas gradient handles when activated from the style panel.
    return [];
  }

  override component(shape: NxLayoutShape) {
    const w = Math.max(1, Number(shape.props.w || 1));
    const h = Math.max(1, Number(shape.props.h || 1));
    const sid = safeId(String(shape.id || 'nxlayout'));

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

    const legacyGx0 = shape.props.gx0;
    const legacyGy0 = shape.props.gy0;
    const legacyGx1 = shape.props.gx1;
    const legacyGy1 = shape.props.gy1;

    // Legacy paints (used when the stack is disabled)
    const fillMode = (shape.props.fillMode || 'solid') as PaintMode;
    const strokeMode = (shape.props.strokeMode || 'solid') as PaintMode;

    const fillSolidRaw = String(shape.props.fill || 'transparent');
    const fillSolid = hex8ToRgbaCss(fillSolidRaw);

    const fillA = String(shape.props.fillA || fillSolidRaw);
    const fillB = String(shape.props.fillB || '#111111ff');
    const fillStops =
      fillMode === 'pattern'
        ? [
            { offset: 0, color: String(fillA || '#000000') },
            { offset: 1, color: String(fillB || '#ffffff') },
          ]
        : parseStopsJson(shape.props.fillStops, fillA, fillB);
    const fillAngle = clamp(Number(shape.props.fillAngle ?? 45), 0, 360);
    const fillPattern = (shape.props.fillPattern || 'stripes') as PatternKind;
    const fillDef =
      fillMode === 'solid'
        ? null
        : getPaintDefs({
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
    const fillPaint = fillMode === 'solid' ? fillSolid : paintUrl('fill', sid);

    const strokeSolidRaw = String(shape.props.stroke || 'transparent');
    const strokeSolid = hex8ToRgbaCss(strokeSolidRaw);
    const strokeA = String(shape.props.strokeA || strokeSolidRaw);
    const strokeB = String(shape.props.strokeB || '#ffffffff');
    const strokeStops =
      strokeMode === 'pattern'
        ? [
            { offset: 0, color: String(strokeA || '#000000') },
            { offset: 1, color: String(strokeB || '#ffffff') },
          ]
        : parseStopsJson(shape.props.strokeStops, strokeA, strokeB);
    const strokeAngle = clamp(Number(shape.props.strokeAngle ?? 45), 0, 360);
    const strokePattern = (shape.props.strokePattern || 'dots') as PatternKind;
    const strokeDef =
      strokeMode === 'solid'
        ? null
        : getPaintDefs({
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
    const strokePaint = strokeMode === 'solid' ? strokeSolid : paintUrl('stroke', sid);

    if (hasLayerStacks) {
      const enabledFills = fillStackActive ? (fillLayers || []).filter((l) => l && (l as any).enabled !== false) : [];
      const enabledStrokes = strokeStackActive ? (strokeLayers || []).filter((l) => l && (l as any).enabled !== false) : [];

      const defs: any[] = [];
      const extraMasks: any[] = [];

      // If only one stack is enabled, keep legacy paints rendering for the other side (including defs).
      if (!fillStackActive && fillMode !== 'solid' && fillDef) defs.push(<Fragment key="def-fill-legacy">{fillDef}</Fragment>);
      if (!strokeStackActive && strokeMode !== 'solid' && strokeDef) defs.push(<Fragment key="def-stroke-legacy">{strokeDef}</Fragment>);

      for (const layer of enabledFills) {
        const layerId = String((layer as any).id || 'layer');
        const mode = String((layer as any).mode || 'solid') as PaintMode;
        if (mode === 'solid') continue;
        const stops =
          parseStopsJsonLoose((layer as any).stops) ||
          (mode === 'pattern'
            ? [
                { offset: 0, color: String((layer as any).solid || fillA || '#000000') },
                { offset: 1, color: String(fillB || '#ffffff') },
              ]
            : (fillStops as any));
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
          const stops =
            parseStopsJsonLoose((layer as any).stops) ||
            (mode === 'pattern'
              ? [
                  { offset: 0, color: String((layer as any).solid || strokeA || '#000000') },
                  { offset: 1, color: String(strokeB || '#ffffff') },
                ]
              : (strokeStops as any));
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
                const width = clamp(Number((layer as any).width ?? shape.props.strokeWidth ?? 2), 0, 256);
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
          ) : (
            <path d={pathD} fill="none" stroke={strokePaint} strokeWidth={clamp(Number(shape.props.strokeWidth ?? 2), 0, 256)} strokeLinejoin="round" />
          )}
        </svg>
      );
    }

    return (
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: 'block', overflow: 'visible' }}>
        <defs>
          {fillDef ? <Fragment key="def-fill">{fillDef}</Fragment> : null}
          {strokeDef ? <Fragment key="def-stroke">{strokeDef}</Fragment> : null}
        </defs>

        <path
          d={pathD}
          fill={fillPaint}
          stroke={clamp(Number(shape.props.strokeWidth ?? 2), 0, 256) > 0 ? strokePaint : 'transparent'}
          strokeWidth={clamp(Number(shape.props.strokeWidth ?? 2), 0, 256)}
        />
      </svg>
    );
  }

  override indicator(shape: NxLayoutShape) {
    const w = Math.max(1, shape.props.w || 1);
    const h = Math.max(1, shape.props.h || 1);
    return <rect width={w} height={h} fill="none" stroke="var(--color-selected)" />;
  }
}

