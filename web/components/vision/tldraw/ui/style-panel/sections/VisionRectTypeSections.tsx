'use client';

import { NxFillStackSection, NxStrokeStackSection } from '@/components/vision/tldraw/ui/style-panel/sections/NxPaintStacksSection';
import { NxRectStrokeSidesSection } from '@/components/vision/tldraw/ui/style-panel/sections/NxRectSections';

export function VisionRectTypeSections({
  enabled,
  fillsJson,
  strokesJson,
  legacyFill,
  legacyStroke,
  strokeStacksDisabledReason,
  showStrokeSides,
  strokeSides,
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
  strokeStacksDisabledReason: string | null;
  showStrokeSides: boolean;
  strokeSides: {
    uniform: boolean;
    width: number;
    top: number;
    right: number;
    bottom: number;
    left: number;
    onSetUniform: (v: boolean) => void;
    onSetAll: (w: number) => void;
    onSetSides: (next: { top: number; right: number; bottom: number; left: number }) => void;
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
        strokeStacksDisabledReason={strokeStacksDisabledReason}
        onConvertFromLegacy={onConvertStrokeFromLegacy}
        onChangeStrokesJson={onChangeStrokesJson}
        onActivateGradientHandles={onActivateStrokeHandles}
      />

      {showStrokeSides ? (
        <NxRectStrokeSidesSection
          uniform={strokeSides.uniform}
          width={strokeSides.width}
          top={strokeSides.top}
          right={strokeSides.right}
          bottom={strokeSides.bottom}
          left={strokeSides.left}
          onSetUniform={strokeSides.onSetUniform}
          onSetAll={strokeSides.onSetAll}
          onSetSides={strokeSides.onSetSides}
        />
      ) : null}
    </>
  );
}

