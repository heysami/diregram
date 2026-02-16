'use client';

import { Rectangle2d, ShapeUtil, T, TLBaseShape } from 'tldraw';
import type { TLHandle, TLHandleDragInfo } from '@tldraw/editor';
import { getNxpathEditableHandles, onNxpathEditableHandleDrag } from '@/components/vision/tldraw/vector-pen';
import { shouldSuppressVectorSourceRender } from '@/components/vision/tldraw/fx/sourceSuppression';
import { getPaintDefs, paintUrl, safeSvgId, type PaintMode, type PatternKind } from '@/components/vision/tldraw/paint/paintDefs';
import { parseStopsJson } from '@/components/vision/tldraw/lib/gradient-stops';

export type NXPathShape = TLBaseShape<
  'nxpath',
  {
    w: number;
    h: number;
    /** SVG path data in local (0,0)-(w,h) coordinates */
    d: string;
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
      fillMode: 'solid',
      fill: '#111111',
      fillA: '#111111',
      fillB: '#ffffff',
      fillAngle: 45,
      fillStops: JSON.stringify([
        { offset: 0, color: '#111111' },
        { offset: 1, color: '#ffffff' },
      ]),
      fillPattern: 'stripes',

      strokeMode: 'solid',
      stroke: 'transparent',
      strokeA: '#111111',
      strokeB: '#ffffff',
      strokeAngle: 45,
      strokeStops: JSON.stringify([
        { offset: 0, color: '#111111' },
        { offset: 1, color: '#ffffff' },
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
    const sid = safeSvgId(String(shape.id || 'nxpath'));

    // Prefer the shared paint model; fall back to legacy v1 props if present.
    const fillMode: PaintMode =
      (shape.props.fillMode as any) ||
      (shape.props.fillKind === 'linear' ? 'linear' : shape.props.fillKind === 'radial' ? 'radial' : 'solid');
    const strokeMode: PaintMode =
      (shape.props.strokeMode as any) ||
      (shape.props.strokeKind === 'linear' ? 'linear' : shape.props.strokeKind === 'radial' ? 'radial' : 'solid');

    const fillSolid = shape.props.fill || 'transparent';
    const strokeSolid = shape.props.stroke || 'transparent';
    const fillA = (shape.props.fillA || fillSolid) as string;
    const fillB = (shape.props.fillB || '#ffffff') as string;
    const strokeA = (shape.props.strokeA || strokeSolid) as string;
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

    return (
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: 'block', overflow: 'visible' }}>
        {(fillMode !== 'solid' || strokeMode !== 'solid') ? (
          <defs>
            {fillDef}
            {strokeDef}
          </defs>
        ) : null}
        <path
          d={shape.props.d || ''}
          fill={fillPaint}
          stroke={strokePaint}
          strokeWidth={shape.props.strokeWidth || 1}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
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

