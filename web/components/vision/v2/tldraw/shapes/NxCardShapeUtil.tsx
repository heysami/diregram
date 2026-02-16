'use client';

import { BaseBoxShapeUtil } from '@tldraw/editor';
import { T, TLBaseShape } from 'tldraw';

export type NxCardShape = TLBaseShape<
  'nxcard',
  {
    w: number;
    h: number;
    /** Legacy/optional title (not rendered). */
    title?: string;
    /** PNG data URL (or other URL) rendered as the card thumbnail. */
    thumb?: string;
    /** JSON string of a nested tldraw snapshot (document-only is recommended). */
    tileSnapshot?: string;
  }
>;

function clamp(v: number, lo: number, hi: number) {
  if (!Number.isFinite(v)) return lo;
  return Math.max(lo, Math.min(hi, v));
}

function safeId(id: string) {
  return String(id || '').replace(/[^a-zA-Z0-9_-]/g, '_') || 'nxcard';
}

// NOTE: tldraw's ShapeUtil is typed against the app's TLShape union. For a local, app-only custom
// shape we keep runtime behavior correct and loosen the generic type to avoid wiring a full
// global TLShapeMap augmentation.
export class NxCardShapeUtil extends BaseBoxShapeUtil<any> {
  static override type = 'nxcard' as const;

  static override props = {
    w: T.number,
    h: T.number,
    title: T.optional(T.string),
    thumb: T.optional(T.string),
    tileSnapshot: T.optional(T.string),
  };

  override getDefaultProps(): NxCardShape['props'] {
    return {
      w: 360,
      h: 240,
      title: undefined,
      thumb: undefined,
      tileSnapshot: undefined,
    };
  }

  override component(shape: NxCardShape) {
    const w = Math.max(1, Number(shape.props.w || 1));
    const h = Math.max(1, Number(shape.props.h || 1));
    const r = clamp(Math.min(w, h) * 0.06, 10, 22);
    const sid = safeId(String(shape.id || 'nxcard'));

    const hasThumb = !!(shape.props.thumb && String(shape.props.thumb).trim());

    return (
      <svg width={w} height={h} className="overflow-visible">
        <defs>
          <clipPath id={`${sid}_clip`}>
            <rect x={0} y={0} width={w} height={h} rx={r} ry={r} />
          </clipPath>
        </defs>

        {/* Card background / border */}
        <rect x={0} y={0} width={w} height={h} rx={r} ry={r} fill="#ffffff" stroke="rgba(0,0,0,0.22)" strokeWidth={1.25} />

        {/* Thumbnail area */}
        <g clipPath={`url(#${sid}_clip)`}>
          {hasThumb ? (
            <image href={String(shape.props.thumb)} x={0} y={0} width={w} height={h} preserveAspectRatio="xMidYMid slice" />
          ) : (
            <>
              <rect x={0} y={0} width={w} height={h} fill="rgba(0,0,0,0.03)" />
              <rect x={18} y={18} width={w - 36} height={h - 36} rx={10} ry={10} fill="rgba(0,0,0,0.02)" stroke="rgba(0,0,0,0.10)" />
              <text
                x={w / 2}
                y={h / 2}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={14}
                fill="rgba(0,0,0,0.55)"
                fontFamily="Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
              >
                Select card, then click Edit
              </text>
            </>
          )}
        </g>
      </svg>
    );
  }

  override indicator(shape: NxCardShape) {
    const w = Math.max(1, Number(shape.props.w || 1));
    const h = Math.max(1, Number(shape.props.h || 1));
    const r = clamp(Math.min(w, h) * 0.06, 10, 22);
    return <rect width={w} height={h} rx={r} ry={r} fill="none" stroke="var(--color-selected)" />;
  }
}

