'use client';

import type { Editor } from 'tldraw';
import { ActionsSection } from '@/components/vision/tldraw/ui/style-panel/sections/ActionsSection';
import { OpacitySection } from '@/components/vision/tldraw/ui/style-panel/sections/OpacitySection';
import { MaskSection } from '@/components/vision/tldraw/ui/style-panel/sections/MaskSection';
import { NxRectCornersSection } from '@/components/vision/tldraw/ui/style-panel/sections/NxRectSections';
import { RectCornerRoundnessSection } from '@/components/vision/tldraw/vector-pen';

export function VisionLayerSection({
  editor,
  selectionCount,
  showActionsWithVectorize,
  showUngroup,
  showUnframe,
  showFlatten,
  showVectorize,
  onUngroup,
  onUnframe,
  onVectorize,
  onUnion,
  onSubtract,
  onIntersect,
  onFlatten,
  opacityValue,
  onChangeOpacity,
  mask,
  rectCorners,
  vectorRoundness,
}: {
  editor: Editor;
  selectionCount: number;
  showActionsWithVectorize: boolean;
  showUngroup: boolean;
  showUnframe: boolean;
  showFlatten: boolean;
  showVectorize: boolean;
  onUngroup: () => void;
  onUnframe: () => void;
  onVectorize: () => void;
  onUnion: () => void;
  onSubtract: () => void;
  onIntersect: () => void;
  onFlatten: () => void;
  opacityValue: number;
  onChangeOpacity: (v: number) => void;
  mask?:
    | {
        supportsFxProxy: boolean;
        canApply: boolean;
        hasMask: boolean;
        maskSourceLabel: string;
        mode: 'shape' | 'alpha';
        invert: boolean;
        strength: number;
        onApply: () => void;
        onClear: () => void;
        onChangeMode: (m: 'shape' | 'alpha') => void;
        onChangeInvert: (v: boolean) => void;
        onChangeStrength: (v: number) => void;
      }
    | null;
  rectCorners?:
    | {
        radiusUniform: boolean;
        radius: number;
        rtl: number;
        rtr: number;
        rbr: number;
        rbl: number;
        onSetUniformRadius: (r: number) => void;
        onSetCorners: (next: { rtl: number; rtr: number; rbr: number; rbl: number; uniform: boolean }) => void;
      }
    | null;
  vectorRoundness?:
    | {
        shape: unknown;
        editable: unknown;
        selectedNodeId: string | null;
        vectorPenActive: boolean;
      }
    | null;
}) {
  return (
    <div className="nx-vsp-section">
      <div className="nx-vsp-title">Layer</div>

      {showActionsWithVectorize ? (
        <ActionsSection
          embedded
          editor={editor}
          selectionCount={selectionCount}
          showUngroup={showUngroup}
          showUnframe={showUnframe}
          showFlatten={showFlatten}
          showVectorize={showVectorize}
          onUngroup={onUngroup}
          onUnframe={onUnframe}
          onVectorize={onVectorize}
          onUnion={onUnion}
          onSubtract={onSubtract}
          onIntersect={onIntersect}
          onFlatten={onFlatten}
        />
      ) : null}

      <OpacitySection embedded value={opacityValue} onChange={onChangeOpacity} />

      {mask?.supportsFxProxy ? (
        <MaskSection
          embedded
          selectionCount={selectionCount}
          canApply={mask.canApply}
          hasMask={mask.hasMask}
          maskSourceLabel={mask.maskSourceLabel}
          mode={mask.mode}
          invert={mask.invert}
          strength={mask.strength}
          onApply={mask.onApply}
          onClear={mask.onClear}
          onChangeMode={mask.onChangeMode}
          onChangeInvert={mask.onChangeInvert}
          onChangeStrength={mask.onChangeStrength}
        />
      ) : null}

      {rectCorners ? (
        <NxRectCornersSection
          embedded
          radiusUniform={rectCorners.radiusUniform}
          radius={rectCorners.radius}
          rtl={rectCorners.rtl}
          rtr={rectCorners.rtr}
          rbr={rectCorners.rbr}
          rbl={rectCorners.rbl}
          onSetUniformRadius={rectCorners.onSetUniformRadius}
          onSetCorners={rectCorners.onSetCorners}
        />
      ) : null}

      {vectorRoundness ? (
        <RectCornerRoundnessSection
          embedded
          editor={editor}
          shape={vectorRoundness.shape as any}
          editable={vectorRoundness.editable as any}
          selectedNodeId={vectorRoundness.selectedNodeId}
          vectorPenActive={vectorRoundness.vectorPenActive}
        />
      ) : null}
    </div>
  );
}

