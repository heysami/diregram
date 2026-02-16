'use client';

import { NxFillStackSection, NxStrokeStackSection } from '@/components/vision/tldraw/ui/style-panel/sections/NxPaintStacksSection';

export function VisionPathTypeSections({
  enabled,
  fillsJson,
  strokesJson,
  legacyFill,
  legacyStroke,
  onConvertFillFromLegacy,
  onConvertStrokeFromLegacy,
  onChangeFillsJson,
  onChangeStrokesJson,
  onActivateFillHandles,
  onActivateStrokeHandles,
}: {
  enabled: boolean;
  fillsJson?: string;
  strokesJson?: string;
  legacyFill: {
    solid: string;
    mode: any;
    stopsJson: string;
    pattern: any;
    angle: number;
  };
  legacyStroke: {
    solid: string;
    mode: any;
    stopsJson: string;
    pattern: any;
    angle: number;
    width: number;
  };
  onConvertFillFromLegacy: () => void;
  onConvertStrokeFromLegacy: () => void;
  onChangeFillsJson: (json: string) => void;
  onChangeStrokesJson: (json: string) => void;
  onActivateFillHandles: (layerId: string) => void;
  onActivateStrokeHandles: (layerId: string) => void;
}) {
  if (!enabled) return null;
  return (
    <>
      <NxFillStackSection
        title="Fill"
        icon="F"
        fillsJson={fillsJson}
        legacySolid={legacyFill.solid}
        legacyMode={legacyFill.mode}
        legacyStopsJson={legacyFill.stopsJson}
        legacyPattern={legacyFill.pattern}
        legacyAngle={legacyFill.angle}
        onConvertFromLegacy={onConvertFillFromLegacy}
        onChangeFillsJson={onChangeFillsJson}
        onActivateGradientHandles={onActivateFillHandles}
      />

      <NxStrokeStackSection
        title="Outline"
        icon="O"
        strokesJson={strokesJson}
        legacySolid={legacyStroke.solid}
        legacyMode={legacyStroke.mode}
        legacyStopsJson={legacyStroke.stopsJson}
        legacyPattern={legacyStroke.pattern}
        legacyAngle={legacyStroke.angle}
        legacyWidth={legacyStroke.width}
        onConvertFromLegacy={onConvertStrokeFromLegacy}
        onChangeStrokesJson={onChangeStrokesJson}
        onActivateGradientHandles={onActivateStrokeHandles}
      />
    </>
  );
}

