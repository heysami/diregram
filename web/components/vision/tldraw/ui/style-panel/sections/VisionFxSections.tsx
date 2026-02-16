'use client';

import type { NxFxDistortion, NxFxStack } from '@/components/vision/tldraw/fx/nxfxTypes';
import { NxFxDistortionSection } from '@/components/vision/tldraw/ui/style-panel/sections/NxFxDistortionSection';
import { NxFxEffectsSection } from '@/components/vision/tldraw/ui/style-panel/sections/NxFxEffectsSection';

export function VisionFxSections({
  enabled,
  fx,
  onChangeFx,
  onAddDropShadow,
  onAddInnerShadow,
  onAddDistortion,
}: {
  enabled: boolean;
  fx: NxFxStack;
  onChangeFx: (next: NxFxStack) => void;
  onAddDropShadow: () => void;
  onAddInnerShadow: () => void;
  onAddDistortion: (kind: NxFxDistortion['kind']) => void;
}) {
  if (!enabled) return null;
  return (
    <>
      <NxFxEffectsSection fx={fx} onChangeFx={onChangeFx} onAddDropShadow={onAddDropShadow} onAddInnerShadow={onAddInnerShadow} />
      <NxFxDistortionSection fx={fx} onChangeFx={onChangeFx} onAdd={onAddDistortion} />
    </>
  );
}

