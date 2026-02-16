'use client';

import { NxFillStackSection, NxStrokeStackSection } from '@/components/vision/tldraw/ui/style-panel/sections/NxPaintStacksSection';
import { NxTextTypographySection } from '@/components/vision/tldraw/ui/style-panel/sections/NxTextTypographySection';

export function VisionTextTypeSections({
  enabled,
  typography,
  fillsJson,
  strokesJson,
  legacyFill,
  legacyStroke,
  onConvertFillFromLegacy,
  onConvertStrokeFromLegacy,
  onChangeTypography,
  onChangeFillsJson,
  onChangeStrokesJson,
  onActivateFillHandles,
  onActivateStrokeHandles,
}: {
  enabled: boolean;
  typography: {
    text: string;
    fontSize: number;
    align: any;
    fontFamily: string;
  };
  fillsJson?: string;
  strokesJson?: string;
  legacyFill: { solid: string; mode: any; stopsJson: string; pattern: any; angle: number };
  legacyStroke: { solid: string; mode: any; stopsJson: string; pattern: any; angle: number; width: number };
  onConvertFillFromLegacy: () => void;
  onConvertStrokeFromLegacy: () => void;
  onChangeTypography: (patch: (prev: any) => any) => void;
  onChangeFillsJson: (json: string) => void;
  onChangeStrokesJson: (json: string) => void;
  onActivateFillHandles: (layerId: string) => void;
  onActivateStrokeHandles: (layerId: string) => void;
}) {
  if (!enabled) return null;
  return (
    <>
      <NxTextTypographySection
        text={typography.text}
        fontSize={typography.fontSize}
        align={typography.align}
        fontFamily={typography.fontFamily}
        onChangeText={(s) => onChangeTypography((prev) => ({ ...prev, text: s }))}
        onChangeFontSize={(n) => onChangeTypography((prev) => ({ ...prev, fontSize: n }))}
        onChangeAlign={(a) => onChangeTypography((prev) => ({ ...prev, align: a }))}
        onChangeFontFamily={(f) => onChangeTypography((prev) => ({ ...prev, fontFamily: f }))}
      />

      <NxFillStackSection
        title="Text fill"
        icon="∎"
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
        title="Text outline"
        icon="⟂"
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

