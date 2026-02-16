'use client';

import { BaseBoxShapeUtil } from '@tldraw/editor';
import { T, TLBaseShape } from 'tldraw';
import { getNxFxRaster } from '@/components/vision/tldraw/fx/nxFxRasterCache';

export type NxFxShape = TLBaseShape<
  'nxfx',
  {
    w: number;
    h: number;
    /** Source shape id that this proxy represents. */
    sourceId: string;
    /** Small monotonic bump to trigger rerenders when raster cache updates. */
    rev: number;
  }
>;

function safeId(id: string) {
  return String(id || 'nxfx').replace(/[^a-zA-Z0-9_-]/g, '_');
}

export class NxFxShapeUtil extends BaseBoxShapeUtil<any> {
  static override type = 'nxfx' as const;

  static override props = {
    w: T.number,
    h: T.number,
    sourceId: T.string,
    rev: T.number,
  };

  override getDefaultProps(): NxFxShape['props'] {
    return { w: 240, h: 160, sourceId: '', rev: 0 };
  }

  override getHandles(): any[] {
    // The proxy’s size is managed by the installer to match the source bounds.
    return [];
  }

  override component(shape: NxFxShape) {
    const w = Math.max(1, Number(shape.props.w || 1));
    const h = Math.max(1, Number(shape.props.h || 1));

    // Use rev to force tldraw to rerender when cache changes.
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    void shape.props.rev;

    const raster = getNxFxRaster(String(shape.id));
    const sid = safeId(String(shape.id || 'nxfx'));

    if (!raster?.url) {
      return (
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: 'block', overflow: 'visible' }}>
          <defs />
          <rect width={w} height={h} fill="rgba(255,255,255,0.55)" />
          <rect width={w} height={h} fill="none" stroke="rgba(0,0,0,0.15)" strokeDasharray="6 4" />
          <text
            x={w / 2}
            y={h / 2}
            textAnchor="middle"
            dominantBaseline="middle"
            fontFamily="Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
            fontSize={12}
            fill="rgba(0,0,0,0.55)"
          >
            Rendering effects…
          </text>
        </svg>
      );
    }

    return (
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: 'block', overflow: 'visible' }}>
        <defs>
          {/* Prevent <image> href caching bugs in some browsers */}
          <pattern id={`${sid}__img`} patternUnits="objectBoundingBox" width="1" height="1">
            <image href={raster.url} x={0} y={0} width={w} height={h} preserveAspectRatio="none" />
          </pattern>
        </defs>
        <rect width={w} height={h} fill={`url(#${sid}__img)`} />
      </svg>
    );
  }

  override indicator(shape: NxFxShape) {
    const w = Math.max(1, shape.props.w || 1);
    const h = Math.max(1, shape.props.h || 1);
    return <rect width={w} height={h} fill="none" stroke="var(--color-selected)" />;
  }
}

