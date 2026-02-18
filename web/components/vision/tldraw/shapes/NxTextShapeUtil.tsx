'use client';

import { Fragment } from 'react';
import { BaseBoxShapeUtil, type TLHandle, type TLHandleDragInfo } from '@tldraw/editor';
import { T, TLBaseShape } from 'tldraw';
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

export type NxTextShape = TLBaseShape<
  'nxtext',
  {
    w: number;
    h: number;
    text: string;
    fontSize: number;
    fontFamily: string;
    align: 'left' | 'center' | 'right';

    /** JSON string of NxFillLayer[] (layer stack). */
    fills?: string;
    /** JSON string of NxStrokeLayer[] (layer stack). */
    strokes?: string;

    fillMode: PaintMode;
    fill: string;
    fillStops?: string; // JSON GradientStop[]
    fillPattern?: PatternKind;

    // Outline around text glyphs
    strokeMode: PaintMode;
    stroke: string;
    strokeStops?: string; // JSON GradientStop[]
    strokeWidth: number;
    strokePattern?: PatternKind;

    // Linear gradient direction in objectBoundingBox space
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

function safeId(id: string) {
  return safeSvgId(id);
}

export class NxTextShapeUtil extends BaseBoxShapeUtil<any> {
  static override type = 'nxtext' as const;

  static override props = {
    w: T.number,
    h: T.number,
    text: T.string,
    fontSize: T.number,
    fontFamily: T.string,
    align: T.literalEnum('left', 'center', 'right'),

    fills: T.optional(T.string),
    strokes: T.optional(T.string),

    fillMode: T.literalEnum('solid', 'linear', 'radial', 'pattern'),
    fill: T.string,
    fillStops: T.optional(T.string),
    fillPattern: T.optional(T.literalEnum('stripes', 'dots', 'checker')),

    strokeMode: T.literalEnum('solid', 'linear', 'radial', 'pattern'),
    stroke: T.string,
    strokeStops: T.optional(T.string),
    strokeWidth: T.number,
    strokePattern: T.optional(T.literalEnum('stripes', 'dots', 'checker')),

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

  override getDefaultProps(): NxTextShape['props'] {
    return {
      w: 240,
      h: 64,
      text: 'Text',
      fontSize: 32,
      fontFamily: 'Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
      align: 'center',

      fills: serializeFillLayers([
        makeDefaultFillLayer({
          mode: 'solid',
          solid: '#111111ff',
          stops: JSON.stringify([
            { offset: 0, color: '#111111ff' },
            { offset: 1, color: '#1a73e8ff' },
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
          solid: '#000000ff',
          stops: JSON.stringify([
            { offset: 0, color: '#000000ff' },
            { offset: 1, color: '#000000ff' },
          ]),
          pattern: 'dots',
          angle: 45,
          width: 0,
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
      fillStops: JSON.stringify([
        { offset: 0, color: '#111111ff' },
        { offset: 1, color: '#1a73e8ff' },
      ]),
      fillPattern: 'stripes',

      strokeMode: 'solid',
      stroke: '#000000ff',
      strokeStops: JSON.stringify([
        { offset: 0, color: '#000000ff' },
        { offset: 1, color: '#000000ff' },
      ]),
      strokeWidth: 0,
      strokePattern: 'dots',

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
    const w = Math.max(1, Number(shape.props.w || 1));
    const h = Math.max(1, Number(shape.props.h || 1));
    const nx = clamp(Number(handle.x || 0) / w, 0, 1);
    const ny = clamp(Number(handle.y || 0) / h, 0, 1);
    if (String(handle.id) === 'g0') {
      return { props: { gx0: nx, gy0: ny } } as any;
    }
    if (String(handle.id) === 'g1') {
      return { props: { gx1: nx, gy1: ny } } as any;
    }
    return;
  }

  override component(shape: NxTextShape) {
    // When fx is active, the raster proxy is the visible representation.
    // Keep the source shape selectable/deletable, but don't double-render it.
    try {
      if (shouldSuppressVectorSourceRender((shape as any).meta)) return null;
    } catch {
      // ignore
    }
    const w = Math.max(1, shape.props.w || 1);
    const h = Math.max(1, shape.props.h || 1);
    const sid = safeId(String(shape.id || 'nxtext'));
    const vectorMask = getVectorShapeMaskDef({ editor: (this as any).editor || null, targetShape: shape, targetSid: sid });
    const fillLayers = parseFillLayers(shape.props.fills);
    const strokeLayers = parseStrokeLayers(shape.props.strokes);
    const fillStackActive = fillLayers !== null;
    const strokeStackActive = strokeLayers !== null;
    const hasLayerStacks = fillStackActive || strokeStackActive;

    const fillMode = (shape.props.fillMode || 'solid') as PaintMode;
    const fillSolidRaw = shape.props.fill || '#111111';
    const fillSolid = hex8ToRgbaCss(fillSolidRaw);
    const fillStops = parseStopsJson(shape.props.fillStops, fillSolidRaw, '#1a73e8');
    const fillPattern = (shape.props.fillPattern || 'stripes') as PatternKind;

    const strokeMode = (shape.props.strokeMode || 'solid') as PaintMode;
    const strokeSolidRaw = shape.props.stroke || 'transparent';
    const strokeSolid = hex8ToRgbaCss(strokeSolidRaw);
    const strokeStops = parseStopsJson(shape.props.strokeStops, strokeSolidRaw === 'transparent' ? '#000000' : strokeSolidRaw, '#000000');
    const strokePattern = (shape.props.strokePattern || 'dots') as PatternKind;
    const strokeWidth = clamp(Number(shape.props.strokeWidth ?? 2), 0, 128);

    const legacyGx0 = clamp(Number(shape.props.gx0 ?? 0), 0, 1);
    const legacyGy0 = clamp(Number(shape.props.gy0 ?? 0), 0, 1);
    const legacyGx1 = clamp(Number(shape.props.gx1 ?? 1), 0, 1);
    const legacyGy1 = clamp(Number(shape.props.gy1 ?? 0), 0, 1);

    const fillGx0 = clamp(Number(shape.props.fillGx0 ?? legacyGx0), 0, 1);
    const fillGy0 = clamp(Number(shape.props.fillGy0 ?? legacyGy0), 0, 1);
    const fillGx1 = clamp(Number(shape.props.fillGx1 ?? legacyGx1), 0, 1);
    const fillGy1 = clamp(Number(shape.props.fillGy1 ?? legacyGy1), 0, 1);

    const strokeGx0 = clamp(Number(shape.props.strokeGx0 ?? legacyGx0), 0, 1);
    const strokeGy0 = clamp(Number(shape.props.strokeGy0 ?? legacyGy0), 0, 1);
    const strokeGx1 = clamp(Number(shape.props.strokeGx1 ?? legacyGx1), 0, 1);
    const strokeGy1 = clamp(Number(shape.props.strokeGy1 ?? legacyGy1), 0, 1);

    const fillPaint = fillMode === 'solid' ? fillSolid : paintUrl('fill', sid);
    const strokePaint = strokeMode === 'solid' ? strokeSolid : paintUrl('stroke', sid);

    const fillDef = getPaintDefs({
      sid,
      kind: 'fill',
      mode: fillMode,
      stops: fillStops as any,
      angle: 45,
      pattern: fillPattern,
      gx0: fillGx0,
      gy0: fillGy0,
      gx1: fillGx1,
      gy1: fillGy1,
    });
    const strokeDef = getPaintDefs({
      sid,
      kind: 'stroke',
      mode: strokeMode,
      stops: strokeStops as any,
      angle: 45,
      pattern: strokePattern,
      gx0: strokeGx0,
      gy0: strokeGy0,
      gx1: strokeGx1,
      gy1: strokeGy1,
    });

    const anchor = shape.props.align === 'left' ? 'start' : shape.props.align === 'right' ? 'end' : 'middle';
    const x = shape.props.align === 'left' ? 0 : shape.props.align === 'right' ? w : w / 2;

    if (hasLayerStacks) {
      const enabledFills = fillStackActive ? (fillLayers || []).filter((l) => l && (l as any).enabled !== false) : [];
      const enabledStrokes = strokeStackActive ? (strokeLayers || []).filter((l) => l && (l as any).enabled !== false) : [];

      const defs: any[] = [];

      const legacyGx0 = clamp(Number(shape.props.gx0 ?? 0), 0, 1);
      const legacyGy0 = clamp(Number(shape.props.gy0 ?? 0), 0, 1);
      const legacyGx1 = clamp(Number(shape.props.gx1 ?? 1), 0, 1);
      const legacyGy1 = clamp(Number(shape.props.gy1 ?? 0), 0, 1);

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
          kind: 'fill',
          mode,
          stops: stops as any,
          angle: Number.isFinite((layer as any).angle) ? Number((layer as any).angle) : 45,
          pattern: ((layer as any).pattern || fillPattern) as any,
          gx0: (layer as any).gx0 ?? clamp(Number(shape.props.fillGx0 ?? legacyGx0), 0, 1),
          gy0: (layer as any).gy0 ?? clamp(Number(shape.props.fillGy0 ?? legacyGy0), 0, 1),
          gx1: (layer as any).gx1 ?? clamp(Number(shape.props.fillGx1 ?? legacyGx1), 0, 1),
          gy1: (layer as any).gy1 ?? clamp(Number(shape.props.fillGy1 ?? legacyGy1), 0, 1),
        });
        if (def) defs.push(<Fragment key={`def-fill-${layerId}`}>{def}</Fragment>);
      }

      for (const layer of enabledStrokes) {
        const mode = String((layer as any).mode || 'solid') as PaintMode;
        if (mode === 'solid') continue;
        const stops = parseStopsJsonLoose((layer as any).stops) || (strokeStops as any);
        const layerId = String((layer as any).id || 'layer');
        const def = getPaintDefs({
          sid,
          layerId,
          kind: 'stroke',
          mode,
          stops: stops as any,
          angle: Number.isFinite((layer as any).angle) ? Number((layer as any).angle) : 45,
          pattern: ((layer as any).pattern || strokePattern) as any,
          gx0: (layer as any).gx0 ?? clamp(Number(shape.props.strokeGx0 ?? legacyGx0), 0, 1),
          gy0: (layer as any).gy0 ?? clamp(Number(shape.props.strokeGy0 ?? legacyGy0), 0, 1),
          gx1: (layer as any).gx1 ?? clamp(Number(shape.props.strokeGx1 ?? legacyGx1), 0, 1),
          gy1: (layer as any).gy1 ?? clamp(Number(shape.props.strokeGy1 ?? legacyGy1), 0, 1),
        });
        if (def) defs.push(<Fragment key={`def-stroke-${layerId}`}>{def}</Fragment>);
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

      const commonTextProps = {
        x,
        y: h / 2,
        textAnchor: anchor as any,
        dominantBaseline: 'middle' as any,
        fontFamily: shape.props.fontFamily || 'Inter',
        fontSize: Math.max(6, Number(shape.props.fontSize || 16)),
      };

      return (
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: 'block', overflow: 'visible' }}>
          {(defs.length || vectorMask) ? (
            <defs>
              {defs}
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
                  const solidRaw = String((layer as any).solid || fillSolidRaw || '#111111');
                  const paint = mode === 'solid' ? hex8ToRgbaCss(solidRaw) : paintUrl('fill', sid, id);
                  return (
                    <text key={`f-${id}`} {...(commonTextProps as any)} fill={paint} stroke="none">
                      {shape.props.text || ''}
                    </text>
                  );
                })
              ) : null
            ) : (
              <text {...(commonTextProps as any)} fill={fillPaint} stroke="none">
                {shape.props.text || ''}
              </text>
            )}

            {/* Stroke stack */}
            {strokeStackActive ? (
              enabledStrokes.length ? (
                enabledStrokes.map((layer) => {
                  const id = String((layer as any).id || 'layer');
                  const mode = String((layer as any).mode || 'solid') as PaintMode;
                  const solidRaw = String((layer as any).solid || strokeSolidRaw || '#000000');
                  const paint = mode === 'solid' ? hex8ToRgbaCss(solidRaw) : paintUrl('stroke', sid, id);
                  const width = Math.max(0, Number((layer as any).width ?? strokeWidth));
                  const join = String((layer as any).join || 'round');
                  const dash = (layer as any).dash || { kind: 'solid' };
                  const { dasharray, dashoffset } = dashToSvg(dash, width);
                  return (
                    <text
                      key={`s-${id}`}
                      {...(commonTextProps as any)}
                      fill="none"
                      stroke={paint}
                      strokeWidth={width > 0 ? width : 0}
                      strokeLinejoin={join as any}
                      strokeDasharray={dasharray}
                      strokeDashoffset={dashoffset}
                      paintOrder="stroke"
                    >
                      {shape.props.text || ''}
                    </text>
                  );
                })
              ) : null
            ) : (
              <text
                {...(commonTextProps as any)}
                fill={fillPaint}
                stroke={strokePaint}
                strokeWidth={strokeWidth > 0 ? strokeWidth : 0}
                paintOrder="stroke fill"
                strokeLinejoin="round"
              >
                {shape.props.text || ''}
              </text>
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
          <text
            x={x}
            y={h / 2}
            textAnchor={anchor as any}
            dominantBaseline="middle"
            fontFamily={shape.props.fontFamily || 'Inter'}
            fontSize={Math.max(6, Number(shape.props.fontSize || 16))}
            fill={fillPaint}
            stroke={strokePaint}
            strokeWidth={strokeWidth > 0 ? strokeWidth : 0}
            paintOrder="stroke fill"
            strokeLinejoin="round"
          >
            {shape.props.text || ''}
          </text>
        </g>
      </svg>
    );
  }

  override indicator(shape: NxTextShape) {
    const w = Math.max(1, shape.props.w || 1);
    const h = Math.max(1, shape.props.h || 1);
    return <rect width={w} height={h} fill="none" stroke="var(--color-selected)" />;
  }
}

