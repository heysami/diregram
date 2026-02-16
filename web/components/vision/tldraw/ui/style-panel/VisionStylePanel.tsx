'use client';

import { DefaultStylePanel, track, useEditor, useRelevantStyles, type TLUiStylePanelProps } from 'tldraw';
import { DefaultDashStyle, DefaultFillStyle, DefaultSizeStyle } from '@tldraw/editor';
import { DefaultColorStyle, DefaultLabelColorStyle } from '@tldraw/tlschema';
import { makeDefaultDropShadow, makeDefaultInnerShadow } from '@/components/vision/tldraw/ui/style-panel/sections/NxFxEffectsSection';
import { clamp01, getFillVariant, getTldrawTokenHex, getVariantHex, makeTheme, nearestTokenForHex, toHexOrEmpty } from '@/components/vision/tldraw/ui/style-panel/color-utils';
import { makeDefaultFillLayer, makeDefaultStrokeLayer, serializeFillLayers, serializeStrokeLayers } from '@/components/vision/tldraw/paint/nxPaintLayers';
import {
  flattenBoolean,
  getFlattenInfoFromSelection,
  createBooleanFromSelection,
  unbundleBooleanToSources,
} from '@/components/vision/tldraw/boolean/bundles';
import { setVisionGradientUiState } from '@/components/vision/tldraw/ui/gradient-handles/visionGradientUiStore';
import { getVisionActionVisibility } from '@/components/vision/tldraw/ui/style-panel/getVisionActionVisibility';
import { coerceNxFx, makeEmptyNxFx, makeFxId, readNxFxFromMeta, writeNxFxToMeta } from '@/components/vision/tldraw/fx/nxfxTypes';
import { resolveStylePanelTargets } from '@/components/vision/tldraw/ui/style-panel/resolvePanelTargets';
import {
  canConvertSelectionToVectorPoints,
  convertSelectionToVectorPoints,
  getSelectedNodeId,
  isVectorPenActive,
  tryParseEditable,
} from '@/components/vision/tldraw/vector-pen';
import { VisionLayerSection } from '@/components/vision/tldraw/ui/style-panel/sections/VisionLayerSection';
import { VisionFxSections } from '@/components/vision/tldraw/ui/style-panel/sections/VisionFxSections';
import { VisionPathTypeSections } from '@/components/vision/tldraw/ui/style-panel/sections/VisionPathTypeSections';
import { VisionRectTypeSections } from '@/components/vision/tldraw/ui/style-panel/sections/VisionRectTypeSections';
import { VisionTextTypeSections } from '@/components/vision/tldraw/ui/style-panel/sections/VisionTextTypeSections';
import { TldrawTypeSections } from '@/components/vision/tldraw/ui/style-panel/sections/TldrawTypeSections';
import { VisionRectLabelSection } from '@/components/vision/tldraw/ui/style-panel/sections/VisionRectLabelSection';

type NxPathLike = { id: string; type: string; props?: any };
function isNxPathShape(s: any): s is NxPathLike {
  return Boolean(s && typeof s === 'object' && s.type === 'nxpath');
}

type NxRectLike = { id: string; type: string; props?: any };
function isNxRectShape(s: any): s is NxRectLike {
  return Boolean(s && typeof s === 'object' && s.type === 'nxrect');
}

type NxTextLike = { id: string; type: string; props?: any };
function isNxTextShape(s: any): s is NxTextLike {
  return Boolean(s && typeof s === 'object' && s.type === 'nxtext');
}

export const VisionStylePanel = track(function VisionStylePanel(props: TLUiStylePanelProps) {
  const editor = useEditor();

  const selectedIds = editor.getSelectedShapeIds().map(String);
  const selectedShapes = editor.getSelectedShapes() as any[];
  const selectionCount = selectedIds.length;

  const panelTargets = resolveStylePanelTargets(editor, selectedShapes);

  const nxPaths = panelTargets.filter(isNxPathShape);
  const nxRects = panelTargets.filter(isNxRectShape);
  const nxTexts = panelTargets.filter(isNxTextShape);
  const hasVisionSelection = nxPaths.length > 0 || nxRects.length > 0 || nxTexts.length > 0;

  // After `resolveStylePanelTargets`, proxies are already resolved to sources.
  const fxTargetsRaw = panelTargets;
  const fxTargets: any[] = [];
  const fxSeen = new Set<string>();
  for (const s of fxTargetsRaw) {
    const id = String(s?.id || '');
    if (!id || fxSeen.has(id)) continue;
    fxSeen.add(id);
    fxTargets.push(s);
  }
  const firstFxTarget = fxTargets[0] || null;
  const firstFx = firstFxTarget ? (readNxFxFromMeta(firstFxTarget.meta) || makeEmptyNxFx()) : makeEmptyNxFx();

  const styles =
    useRelevantStyles([DefaultColorStyle, DefaultLabelColorStyle, DefaultFillStyle, DefaultDashStyle, DefaultSizeStyle]) ||
    props.styles ||
    null;

  // Hide the entire right panel when nothing is selected.
  // (Must be after hooks so hook order is stable across renders.)
  if (selectionCount === 0) return null;

  const sharedColor = styles?.get(DefaultColorStyle);
  const sharedLabelColor = styles?.get(DefaultLabelColorStyle);
  const sharedFill = styles?.get(DefaultFillStyle);
  const sharedDash = styles?.get(DefaultDashStyle);
  const sharedSize = styles?.get(DefaultSizeStyle);

  const colorToken = sharedColor?.type === 'shared' ? String((sharedColor as any).value) : '';
  const labelColorToken = sharedLabelColor?.type === 'shared' ? String((sharedLabelColor as any).value) : '';
  const fillStyle = sharedFill?.type === 'shared' ? String((sharedFill as any).value) : '';
  const dashStyle = sharedDash?.type === 'shared' ? String((sharedDash as any).value) : '';
  const sizeStyle = sharedSize?.type === 'shared' ? String((sharedSize as any).value) : '';

  const opacityShared = editor.getSharedOpacity();
  const opacityValue = opacityShared?.type === 'shared' ? clamp01(Number((opacityShared as any).value)) : 1;

  const flattenInfo = getFlattenInfoFromSelection(editor, selectedIds);
  const canBoolean = selectionCount >= 2;
  const canVectorize = selectionCount === 1 ? canConvertSelectionToVectorPoints(editor) : false;

  const { showActions, showFlatten, showUngroup } = getVisionActionVisibility(selectedIds, selectedShapes, flattenInfo);
  const showActionsWithVectorize = showActions || canVectorize;

  const theme = makeTheme(editor);
  const fillVariant = getFillVariant(fillStyle);

  const setPrimaryColorFromHex = (hex: string, variant: 'fill' | 'semi' | 'pattern' | 'solid') => {
    const token = nearestTokenForHex({ theme, hex, variant });
    if (!token) return;
    try {
      editor.setStyleForSelectedShapes(DefaultColorStyle as any, token as any);
      editor.setStyleForNextShapes(DefaultColorStyle as any, token as any);
    } catch {
      // ignore
    }
  };

  const setTextColorFromHex = (hex: string) => {
    const token = nearestTokenForHex({ theme, hex, variant: 'solid' });
    if (!token) return;
    try {
      editor.setStyleForSelectedShapes(DefaultColorStyle as any, token as any);
      editor.setStyleForNextShapes(DefaultColorStyle as any, token as any);
      editor.setStyleForSelectedShapes(DefaultLabelColorStyle as any, token as any);
      editor.setStyleForNextShapes(DefaultLabelColorStyle as any, token as any);
    } catch {
      // ignore
    }
  };

  const sizeNumber = sizeStyle === 's' ? 1 : sizeStyle === 'm' ? 2 : sizeStyle === 'l' ? 3 : sizeStyle === 'xl' ? 4 : 2;
  const sizeTokenFromNumber = (n: number) => (n <= 1 ? 's' : n === 2 ? 'm' : n === 3 ? 'l' : 'xl');

  const firstNx = nxPaths[0] || null;
  const editable = selectionCount === 1 ? tryParseEditable(firstNx?.props?.nxEdit) : null;
  const vectorPenActive = isVectorPenActive(editor);
  const selectedNodeId = getSelectedNodeId(editor);
  const nxFillSolid = toHexOrEmpty(firstNx?.props?.fill || '#111111') || '#111111';
  const nxStrokeSolid = toHexOrEmpty(firstNx?.props?.stroke || '#111111') || '#111111';
  const nxStrokeWidth = Number(firstNx?.props?.strokeWidth ?? 1) || 1;
  const nxFillA = toHexOrEmpty(firstNx?.props?.fillA || nxFillSolid) || nxFillSolid;
  const nxFillB = toHexOrEmpty(firstNx?.props?.fillB || '#ffffff') || '#ffffff';
  const nxStrokeA = toHexOrEmpty(firstNx?.props?.strokeA || nxStrokeSolid) || nxStrokeSolid;
  const nxStrokeB = toHexOrEmpty(firstNx?.props?.strokeB || '#ffffff') || '#ffffff';
  const nxFillAngle = Number.isFinite(firstNx?.props?.fillAngle) ? Number(firstNx?.props?.fillAngle) : 45;
  const nxStrokeAngle = Number.isFinite(firstNx?.props?.strokeAngle) ? Number(firstNx?.props?.strokeAngle) : 45;
  const nxFillMode =
    String(firstNx?.props?.fillMode || '') ||
    (firstNx?.props?.fillKind === 'linear' ? 'linear' : firstNx?.props?.fillKind === 'radial' ? 'radial' : 'solid');
  const nxStrokeMode =
    String(firstNx?.props?.strokeMode || '') ||
    (firstNx?.props?.strokeKind === 'linear' ? 'linear' : firstNx?.props?.strokeKind === 'radial' ? 'radial' : 'solid');
  const nxFillPattern = String(firstNx?.props?.fillPattern || 'stripes');
  const nxStrokePattern = String(firstNx?.props?.strokePattern || 'dots');
  const nxFillStopsJson = String(firstNx?.props?.fillStops || '');
  const nxStrokeStopsJson = String(firstNx?.props?.strokeStops || '');

  const updateNxProps = (patch: (prev: any) => any) => {
    if (nxPaths.length === 0) return;
    try {
      editor.updateShapes(
        nxPaths.map((s) => ({
          id: s.id,
          type: s.type,
          props: patch(s.props || {}),
        })) as any,
      );
    } catch {
      // ignore
    }
  };

  const tldrawFillHex = colorToken ? getVariantHex(theme, colorToken, fillVariant) || getTldrawTokenHex(colorToken) || '#000000' : '#000000';
  const tldrawOutlineHex = colorToken ? getVariantHex(theme, colorToken, 'solid') || getTldrawTokenHex(colorToken) || '#000000' : '#000000';
  const tldrawTextHex =
    (labelColorToken ? getVariantHex(theme, labelColorToken, 'solid') : null) ||
    (colorToken ? getVariantHex(theme, colorToken, 'solid') : null) ||
    '#000000';
  const updateNxRectProps = (patch: (prev: any) => any) => {
    if (nxRects.length === 0) return;
    try {
      editor.updateShapes(
        nxRects.map((s) => ({ id: s.id, type: s.type, props: patch(s.props || {}) })) as any,
      );
    } catch {
      // ignore
    }
  };

  const updateNxTextProps = (patch: (prev: any) => any) => {
    if (nxTexts.length === 0) return;
    try {
      editor.updateShapes(
        nxTexts.map((s) => ({ id: s.id, type: s.type, props: patch(s.props || {}) })) as any,
      );
    } catch {
      // ignore
    }
  };

  const updateFxMetaForTargets = (patch: (prev: any) => any) => {
    if (fxTargets.length === 0) return;
    try {
      editor.updateShapes(
        fxTargets.map((s) => {
          const prevMeta = s.meta || {};
          const nextMeta = patch(prevMeta);
          return { id: s.id, type: s.type, meta: nextMeta } as any;
        }) as any,
      );
    } catch {
      // ignore
    }
  };

  const setFxForTargets = (nextFx: any) => {
    updateFxMetaForTargets((prevMeta) => writeNxFxToMeta(prevMeta, coerceNxFx(nextFx)));
  };

  return (
    <DefaultStylePanel {...props}>
      <div className="nx-vsp">
        <VisionLayerSection
          editor={editor}
          selectionCount={selectionCount}
          showActionsWithVectorize={showActionsWithVectorize}
          showUngroup={showUngroup}
          showFlatten={showFlatten}
          showVectorize={canVectorize}
          onUngroup={() => {
            // If selection is a non-destructive boolean result/bundle, "Ungroup" should delete the
            // boolean and restore the sources as independent shapes.
            if (flattenInfo) {
              unbundleBooleanToSources(editor, flattenInfo).catch(() => {});
              return;
            }
            try {
              const ids = editor.getSelectedShapeIds();
              if (ids.length) editor.ungroupShapes(ids);
            } catch {
              // ignore
            }
          }}
          onVectorize={() => {
            convertSelectionToVectorPoints(editor).catch(() => {});
          }}
          onUnion={() => createBooleanFromSelection(editor, 'union').catch(() => {})}
          onSubtract={() => createBooleanFromSelection(editor, 'subtract').catch(() => {})}
          onIntersect={() => createBooleanFromSelection(editor, 'intersect').catch(() => {})}
          onFlatten={() => flattenInfo && flattenBoolean(editor, flattenInfo).catch(() => {})}
          opacityValue={opacityValue}
          onChangeOpacity={(v) => {
            const vv = clamp01(v);
            try {
              editor.setOpacityForSelectedShapes(vv);
              editor.setOpacityForNextShapes(vv);
            } catch {
              // ignore
            }
          }}
          rectCorners={
            nxRects.length > 0
              ? {
                  radiusUniform: !!nxRects[0]?.props?.radiusUniform,
                  radius: Number(nxRects[0]?.props?.radius ?? 0) || 0,
                  rtl: Number(nxRects[0]?.props?.radiusTL ?? nxRects[0]?.props?.radius ?? 0) || 0,
                  rtr: Number(nxRects[0]?.props?.radiusTR ?? nxRects[0]?.props?.radius ?? 0) || 0,
                  rbr: Number(nxRects[0]?.props?.radiusBR ?? nxRects[0]?.props?.radius ?? 0) || 0,
                  rbl: Number(nxRects[0]?.props?.radiusBL ?? nxRects[0]?.props?.radius ?? 0) || 0,
                  onSetUniformRadius: (r) =>
                    updateNxRectProps((prev) => ({
                      ...prev,
                      radiusUniform: true,
                      radius: r,
                      radiusTL: r,
                      radiusTR: r,
                      radiusBR: r,
                      radiusBL: r,
                    })),
                  onSetCorners: (next) =>
                    updateNxRectProps((prev) => ({
                      ...prev,
                      radiusUniform: next.uniform,
                      radius: next.uniform ? next.rtl : prev.radius,
                      radiusTL: next.rtl,
                      radiusTR: next.rtr,
                      radiusBR: next.rbr,
                      radiusBL: next.rbl,
                    })),
                }
              : null
          }
          vectorRoundness={
            nxPaths.length > 0
              ? { shape: firstNx, editable, selectedNodeId, vectorPenActive }
              : null
          }
        />

        {/* Type-specific: paint stacks (vision shapes) or default tldraw styles */}
        <VisionPathTypeSections
          enabled={nxPaths.length > 0}
          fillsJson={String(firstNx?.props?.fills || '') || undefined}
          strokesJson={String(firstNx?.props?.strokes || '') || undefined}
          legacyFill={{
            solid: nxFillSolid,
            mode: nxFillMode as any,
            stopsJson: nxFillStopsJson,
            pattern: nxFillPattern as any,
            angle: nxFillAngle,
          }}
          legacyStroke={{
            solid: nxStrokeSolid,
            mode: nxStrokeMode as any,
            stopsJson: nxStrokeStopsJson,
            pattern: nxStrokePattern as any,
            angle: nxStrokeAngle,
            width: nxStrokeWidth,
          }}
          onConvertFillFromLegacy={() =>
            updateNxProps((prev) => ({
              ...prev,
              fills: serializeFillLayers([
                makeDefaultFillLayer({
                  mode: nxFillMode as any,
                  solid: nxFillSolid,
                  stops: nxFillStopsJson,
                  pattern: nxFillPattern as any,
                  angle: nxFillAngle,
                } as any),
              ]),
            }))
          }
          onConvertStrokeFromLegacy={() =>
            updateNxProps((prev) => ({
              ...prev,
              strokes: serializeStrokeLayers([
                makeDefaultStrokeLayer({
                  mode: nxStrokeMode as any,
                  solid: nxStrokeSolid,
                  stops: nxStrokeStopsJson,
                  pattern: nxStrokePattern as any,
                  angle: nxStrokeAngle,
                  width: nxStrokeWidth,
                } as any),
              ]),
            }))
          }
          onChangeFillsJson={(json) => updateNxProps((prev) => ({ ...prev, fills: json }))}
          onChangeStrokesJson={(json) => updateNxProps((prev) => ({ ...prev, strokes: json }))}
          onActivateFillHandles={(layerId) => setVisionGradientUiState({ shapeId: String(firstNx?.id || ''), paint: 'fill', layerId })}
          onActivateStrokeHandles={(layerId) => setVisionGradientUiState({ shapeId: String(firstNx?.id || ''), paint: 'stroke', layerId })}
        />

        <VisionRectTypeSections
          enabled={nxRects.length > 0}
          fillsJson={String(nxRects[0]?.props?.fills || '') || undefined}
          strokesJson={String(nxRects[0]?.props?.strokes || '') || undefined}
          legacyFill={{
            solid: String(nxRects[0]?.props?.fill || '#ffffff'),
            mode: String(nxRects[0]?.props?.fillMode || 'solid') as any,
            stopsJson: String(nxRects[0]?.props?.fillStops || ''),
            pattern: String(nxRects[0]?.props?.fillPattern || 'stripes') as any,
            angle: Number(nxRects[0]?.props?.fillAngle ?? 45) || 45,
          }}
          legacyStroke={{
            solid: String(nxRects[0]?.props?.stroke || '#111111'),
            mode: String(nxRects[0]?.props?.strokeMode || 'solid') as any,
            stopsJson: String(nxRects[0]?.props?.strokeStops || ''),
            pattern: String(nxRects[0]?.props?.strokePattern || 'dots') as any,
            angle: Number(nxRects[0]?.props?.strokeAngle ?? 45) || 45,
            width: Number(nxRects[0]?.props?.strokeWidth ?? 1) || 1,
          }}
          strokeStacksDisabledReason={
            !Boolean(nxRects[0]?.props?.strokeUniform)
              ? 'Outline layers require “Uniform” outline (disable per-side outline widths).'
              : null
          }
          showStrokeSides={!String(nxRects[0]?.props?.strokes || '')}
          strokeSides={{
            uniform: !!nxRects[0]?.props?.strokeUniform,
            width: Number(nxRects[0]?.props?.strokeWidth ?? 1) || 1,
            top: Number(nxRects[0]?.props?.strokeTop ?? nxRects[0]?.props?.strokeWidth ?? 1) || 1,
            right: Number(nxRects[0]?.props?.strokeRight ?? nxRects[0]?.props?.strokeWidth ?? 1) || 1,
            bottom: Number(nxRects[0]?.props?.strokeBottom ?? nxRects[0]?.props?.strokeWidth ?? 1) || 1,
            left: Number(nxRects[0]?.props?.strokeLeft ?? nxRects[0]?.props?.strokeWidth ?? 1) || 1,
            onSetUniform: (v) =>
              updateNxRectProps((prev) => ({
                ...prev,
                strokeUniform: v,
              })),
            onSetAll: (w) =>
              updateNxRectProps((prev) => ({
                ...prev,
                strokeWidth: w,
                strokeTop: w,
                strokeRight: w,
                strokeBottom: w,
                strokeLeft: w,
              })),
            onSetSides: (next) =>
              updateNxRectProps((prev) => ({
                ...prev,
                strokeTop: next.top,
                strokeRight: next.right,
                strokeBottom: next.bottom,
                strokeLeft: next.left,
              })),
          }}
          onConvertFillFromLegacy={() =>
            updateNxRectProps((prev) => ({
              ...prev,
              fills: serializeFillLayers([
                makeDefaultFillLayer({
                  mode: String(prev?.fillMode || 'solid') as any,
                  solid: String(prev?.fill || '#ffffff'),
                  stops: String(prev?.fillStops || ''),
                  pattern: String(prev?.fillPattern || 'stripes') as any,
                  angle: Number(prev?.fillAngle ?? 45) || 45,
                } as any),
              ]),
            }))
          }
          onConvertStrokeFromLegacy={() =>
            updateNxRectProps((prev) => ({
              ...prev,
              strokes: serializeStrokeLayers([
                makeDefaultStrokeLayer({
                  mode: String(prev?.strokeMode || 'solid') as any,
                  solid: String(prev?.stroke || '#111111'),
                  stops: String(prev?.strokeStops || ''),
                  pattern: String(prev?.strokePattern || 'dots') as any,
                  angle: Number(prev?.strokeAngle ?? 45) || 45,
                  width: Number(prev?.strokeWidth ?? 1) || 1,
                } as any),
              ]),
            }))
          }
          onChangeFillsJson={(json) => updateNxRectProps((prev) => ({ ...prev, fills: json }))}
          onChangeStrokesJson={(json) => updateNxRectProps((prev) => ({ ...prev, strokes: json }))}
          onActivateFillHandles={(layerId) => setVisionGradientUiState({ shapeId: String(nxRects[0]?.id || ''), paint: 'fill', layerId })}
          onActivateStrokeHandles={(layerId) => setVisionGradientUiState({ shapeId: String(nxRects[0]?.id || ''), paint: 'stroke', layerId })}
        />

        <VisionTextTypeSections
          enabled={nxTexts.length > 0}
          typography={{
            text: String(nxTexts[0]?.props?.text || ''),
            fontSize: Number(nxTexts[0]?.props?.fontSize ?? 32) || 32,
            align: String(nxTexts[0]?.props?.align || 'center') as any,
            fontFamily: String(nxTexts[0]?.props?.fontFamily || 'Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif'),
          }}
          fillsJson={String(nxTexts[0]?.props?.fills || '') || undefined}
          strokesJson={String(nxTexts[0]?.props?.strokes || '') || undefined}
          legacyFill={{
            solid: String(nxTexts[0]?.props?.fill || '#111111'),
            mode: String(nxTexts[0]?.props?.fillMode || 'solid') as any,
            stopsJson: String(nxTexts[0]?.props?.fillStops || ''),
            pattern: String(nxTexts[0]?.props?.fillPattern || 'stripes') as any,
            angle: 45,
          }}
          legacyStroke={{
            solid: String(nxTexts[0]?.props?.stroke || '#000000'),
            mode: String(nxTexts[0]?.props?.strokeMode || 'solid') as any,
            stopsJson: String(nxTexts[0]?.props?.strokeStops || ''),
            pattern: String(nxTexts[0]?.props?.strokePattern || 'dots') as any,
            angle: 45,
            width: Number(nxTexts[0]?.props?.strokeWidth ?? 0) || 0,
          }}
          onChangeTypography={(patch) => updateNxTextProps(patch)}
          onConvertFillFromLegacy={() =>
            updateNxTextProps((prev) => ({
              ...prev,
              fills: serializeFillLayers([
                makeDefaultFillLayer({
                  mode: String(prev?.fillMode || 'solid') as any,
                  solid: String(prev?.fill || '#111111'),
                  stops: String(prev?.fillStops || ''),
                  pattern: String(prev?.fillPattern || 'stripes') as any,
                  angle: 45,
                } as any),
              ]),
            }))
          }
          onConvertStrokeFromLegacy={() =>
            updateNxTextProps((prev) => ({
              ...prev,
              strokes: serializeStrokeLayers([
                makeDefaultStrokeLayer({
                  mode: String(prev?.strokeMode || 'solid') as any,
                  solid: String(prev?.stroke || '#000000'),
                  stops: String(prev?.strokeStops || ''),
                  pattern: String(prev?.strokePattern || 'dots') as any,
                  angle: 45,
                  width: Number(prev?.strokeWidth ?? 0) || 0,
                } as any),
              ]),
            }))
          }
          onChangeFillsJson={(json) => updateNxTextProps((prev) => ({ ...prev, fills: json }))}
          onChangeStrokesJson={(json) => updateNxTextProps((prev) => ({ ...prev, strokes: json }))}
          onActivateFillHandles={(layerId) => setVisionGradientUiState({ shapeId: String(nxTexts[0]?.id || ''), paint: 'fill', layerId })}
          onActivateStrokeHandles={(layerId) => setVisionGradientUiState({ shapeId: String(nxTexts[0]?.id || ''), paint: 'stroke', layerId })}
        />

        <TldrawTypeSections
          enabled={!hasVisionSelection}
          editor={editor}
          fill={{
            color: tldrawFillHex,
            mixed: sharedColor?.type === 'mixed',
            placeholder: sharedColor?.type === 'mixed' ? 'mixed' : '#rrggbb',
            fillStyle,
          }}
          outline={{
            color: tldrawOutlineHex,
            mixed: sharedColor?.type === 'mixed',
            placeholder: sharedColor?.type === 'mixed' ? 'mixed' : '#rrggbb',
            dashStyle,
          }}
          text={{
            color: tldrawTextHex,
            mixed: sharedLabelColor?.type === 'mixed' || sharedColor?.type === 'mixed',
            placeholder: sharedLabelColor?.type === 'mixed' || sharedColor?.type === 'mixed' ? 'mixed' : '#rrggbb',
          }}
          sizeNumber={sizeNumber}
          sizeTokenFromNumber={sizeTokenFromNumber}
          onPickPrimaryColor={setPrimaryColorFromHex}
          onPickTextColor={setTextColorFromHex}
        />

        {/* FX (applies to any selection target) */}
        <VisionFxSections
          enabled={fxTargets.length > 0}
          fx={firstFx as any}
          onChangeFx={(next) => setFxForTargets(next)}
          onAddDropShadow={() => {
            const id = makeFxId('ds');
            setFxForTargets({ ...firstFx, effects: [...(firstFx.effects || []), makeDefaultDropShadow(id)] });
          }}
          onAddInnerShadow={() => {
            const id = makeFxId('is');
            setFxForTargets({ ...firstFx, effects: [...(firstFx.effects || []), makeDefaultInnerShadow(id)] });
          }}
          onAddDistortion={(kind) => {
            const id = makeFxId(kind);
            const seed = Math.floor(Math.random() * 2147483647);
            const d: any =
              kind === 'blur'
                ? { id, kind, enabled: true, radius: 8 }
                : kind === 'motionBlur'
                  ? { id, kind, enabled: true, angleDeg: 0, distance: 18, samples: 10 }
                  : kind === 'bloom'
                    ? { id, kind, enabled: true, threshold: 0.75, radius: 16, intensity: 1.2 }
                    : kind === 'glitch'
                      ? { id, kind, enabled: true, strength: 0.35, rgbOffset: 3, scanlines: 0.25, seed }
                      : kind === 'mosh'
                        ? { id, kind, enabled: true, strength: 0.35, blockSize: 18, seed }
                        : kind === 'grain'
                          ? { id, kind, enabled: true, strength: 0.22, size: 1.2, seed }
                          : { id, kind, enabled: true, strength: 0.45, scale: 6, seed };
            setFxForTargets({ ...firstFx, distortions: [...(firstFx.distortions || []), d] });
          }}
        />

        {/* Label (nxrect only) */}
        <VisionRectLabelSection
          enabled={nxRects.length > 0}
          label={String(nxRects[0]?.props?.label || '')}
          labelSize={Number(nxRects[0]?.props?.labelSize ?? 18) || 18}
          labelAlign={String(nxRects[0]?.props?.labelAlign || 'center') as any}
          labelColor={String(nxRects[0]?.props?.labelColor || '#111111')}
          onChangeLabel={(s) => updateNxRectProps((prev) => ({ ...prev, label: s }))}
          onChangeLabelSize={(n) => updateNxRectProps((prev) => ({ ...prev, labelSize: n }))}
          onChangeLabelAlign={(a) => updateNxRectProps((prev) => ({ ...prev, labelAlign: a }))}
          onChangeLabelColor={(hex) => updateNxRectProps((prev) => ({ ...prev, labelColor: hex }))}
        />
      </div>
    </DefaultStylePanel>
  );
});

