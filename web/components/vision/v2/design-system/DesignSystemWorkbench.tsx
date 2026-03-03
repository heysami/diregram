'use client';

import { type CSSProperties } from 'react';
import { deriveDesignSystemTokens, normalizeVisionDesignSystem, type VisionDesignSystemV1 } from '@/lib/vision-design-system';
import { DesignSystemControls } from '@/components/vision/v2/design-system/DesignSystemControls';
import { DesignSystemPreview } from '@/components/vision/v2/design-system/DesignSystemPreview';

export function DesignSystemWorkbench({
  value,
  onChange,
}: {
  value: VisionDesignSystemV1;
  onChange: (next: VisionDesignSystemV1) => void;
}) {
  const derived = value.derived || deriveDesignSystemTokens(value);
  const workbenchVars = {
    '--vds-editor-input-radius': `${Math.max(6, Math.round(derived.shape.inputRadius * 0.72 + 6))}px`,
  } as CSSProperties;

  return (
    <div className="vds-workbench" style={workbenchVars}>
      <aside className="vds-workbench__controls">
        <DesignSystemControls
          value={value}
          onChange={(next) => {
            const normalized = normalizeVisionDesignSystem({ ...next, updatedAt: new Date().toISOString() });
            onChange(normalized);
          }}
        />
      </aside>

      <section className="vds-workbench__preview">
        <div className="vds-top-metrics">
          <div className="vds-top-metrics__item">
            <span>Typography scale</span>
            <strong>{derived.typography.scale.toFixed(3)}</strong>
          </div>
          <div className="vds-top-metrics__item">
            <span>Spacing around/inside</span>
            <strong>
              {derived.spacing.aroundPx}px / {derived.spacing.insidePx}px
            </strong>
          </div>
          <div className="vds-top-metrics__item">
            <span>Bold zone coverage</span>
            <strong>{Math.round(derived.composition.boldZoneCoverage * 100)}%</strong>
          </div>
          <div className="vds-top-metrics__item">
            <span>Material budget</span>
            <strong>{Math.round(derived.effects.materialBudget * 100)}%</strong>
          </div>
          <div className="vds-top-metrics__item">
            <span>Input radius</span>
            <strong>{derived.shape.inputRadius}px</strong>
          </div>
        </div>
        <DesignSystemPreview value={value} />
      </section>
    </div>
  );
}
