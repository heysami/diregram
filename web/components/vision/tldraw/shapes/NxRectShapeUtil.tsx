'use client';

import { BaseBoxShapeUtil, type TLHandle, type TLHandleDragInfo } from '@tldraw/editor';
import { T, TLBaseShape } from 'tldraw';
import { parseStopsJson, type GradientStop } from '@/components/vision/tldraw/lib/gradient-stops';
import { shouldSuppressVectorSourceRender } from '@/components/vision/tldraw/fx/sourceSuppression';
import { getPaintDefs, paintUrl, safeSvgId, type PaintMode, type PatternKind } from '@/components/vision/tldraw/paint/paintDefs';

// PaintMode/PatternKind are shared in `paintDefs` so all shapes behave consistently.

export type NxRectShape = TLBaseShape<
  'nxrect',
  {
    w: number;
    h: number;

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

      fillMode: 'solid',
      fill: '#ffffff',
      fillA: '#ffffff',
      fillB: '#111111',
      fillAngle: 45,
      fillStops: JSON.stringify([
        { offset: 0, color: '#ffffff' },
        { offset: 1, color: '#111111' },
      ]),
      fillPattern: 'stripes',

      strokeMode: 'solid',
      stroke: '#111111',
      strokeA: '#111111',
      strokeB: '#ffffff',
      strokeAngle: 45,
      strokeStops: JSON.stringify([
        { offset: 0, color: '#111111' },
        { offset: 1, color: '#ffffff' },
      ]),
      strokePattern: 'dots',

      strokeUniform: true,
      strokeWidth: 2,

      radiusUniform: true,
      radius: 12,

      label: '',
      labelColor: '#111111',
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

    const fillMode = (shape.props.fillMode || 'solid') as PaintMode;
    const strokeMode = (shape.props.strokeMode || 'solid') as PaintMode;
    const fillSolid = shape.props.fill || 'transparent';
    const strokeSolid = shape.props.stroke || 'transparent';

    const fillA = (shape.props.fillA || fillSolid) as string;
    const fillB = (shape.props.fillB || '#111111') as string;
    const strokeA = (shape.props.strokeA || strokeSolid) as string;
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
    const labelColor = String(shape.props.labelColor || '#111111');
    const labelSize = clamp(Number(shape.props.labelSize ?? 18), 6, 256);
    const labelAlign = (shape.props.labelAlign || 'center') as 'left' | 'center' | 'right';
    const pad = 10;
    const textAnchor = labelAlign === 'left' ? 'start' : labelAlign === 'right' ? 'end' : 'middle';
    const textX = labelAlign === 'left' ? pad : labelAlign === 'right' ? w - pad : w / 2;

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

