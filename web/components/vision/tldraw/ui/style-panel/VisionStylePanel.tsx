'use client';

import { DefaultStylePanel, track, useEditor, useRelevantStyles, type TLUiStylePanelProps } from 'tldraw';
import { DefaultDashStyle, DefaultFillStyle, DefaultSizeStyle } from '@tldraw/editor';
import { DefaultColorStyle, DefaultLabelColorStyle } from '@tldraw/tlschema';
import { ActionsSection } from '@/components/vision/tldraw/ui/style-panel/sections/ActionsSection';
import { OpacitySection } from '@/components/vision/tldraw/ui/style-panel/sections/OpacitySection';
import { NxFxEffectsSection, makeDefaultDropShadow, makeDefaultInnerShadow } from '@/components/vision/tldraw/ui/style-panel/sections/NxFxEffectsSection';
import { NxFxDistortionSection } from '@/components/vision/tldraw/ui/style-panel/sections/NxFxDistortionSection';
// NOTE: we intentionally use the same paint section for `nxpath` and `nxrect` so gradients behave consistently.
import { NxRectCornersSection, NxRectPaintSection, NxRectStrokeSidesSection } from '@/components/vision/tldraw/ui/style-panel/sections/NxRectSections';
import { NxRectLabelSection } from '@/components/vision/tldraw/ui/style-panel/sections/NxRectLabelSection';
import { NxTextTypographySection } from '@/components/vision/tldraw/ui/style-panel/sections/NxTextTypographySection';
import { TldrawFillSection, TldrawOutlineSection, TldrawTextSection } from '@/components/vision/tldraw/ui/style-panel/sections/TldrawSections';
import { clamp01, getFillVariant, getTldrawTokenHex, getVariantHex, makeTheme, nearestTokenForHex, toHexOrEmpty } from '@/components/vision/tldraw/ui/style-panel/color-utils';
import { parseStopsJson, serializeStops } from '@/components/vision/tldraw/lib/gradient-stops';
import {
  flattenBoolean,
  getFlattenInfoFromSelection,
  createBooleanFromSelection,
  unbundleBooleanToSources,
} from '@/components/vision/tldraw/boolean/bundles';
import { setVisionGradientUiState } from '@/components/vision/tldraw/ui/gradient-handles/visionGradientUiStore';
import { getVisionActionVisibility } from '@/components/vision/tldraw/ui/style-panel/getVisionActionVisibility';
import { coerceNxFx, isNxFxEmpty, makeEmptyNxFx, makeFxId, readNxFxFromMeta, writeNxFxToMeta } from '@/components/vision/tldraw/fx/nxfxTypes';
import { toggleNxFxEditMode } from '@/components/vision/tldraw/fx/installVisionFxProxy';
import { resolveStylePanelTargets } from '@/components/vision/tldraw/ui/style-panel/resolvePanelTargets';
import {
  RectCornerRoundnessSection,
  canConvertSelectionToVectorPoints,
  convertSelectionToVectorPoints,
  getSelectedNodeId,
  isVectorPenActive,
  tryParseEditable,
} from '@/components/vision/tldraw/vector-pen';

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
  const hasFxOnSelection = Boolean(firstFxTarget && !isNxFxEmpty(firstFx));

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

  const updateStops = (json: string, which: 'fill' | 'stroke') => {
    const key = which === 'fill' ? 'fillStops' : 'strokeStops';
    updateNxTextProps((prev) => ({ ...prev, [key]: json }));
  };

  const updateStopEnd = (which: 'fill' | 'stroke', end: 'a' | 'b', hex: string) => {
    const keyStops = which === 'fill' ? String(nxTexts[0]?.props?.fillStops || '') : String(nxTexts[0]?.props?.strokeStops || '');
    const base = which === 'fill' ? String(nxTexts[0]?.props?.fill || '#111111') : String(nxTexts[0]?.props?.stroke || '#000000');
    const stops = parseStopsJson(keyStops, base, base);
    if (stops.length >= 2) {
      if (end === 'a') stops[0] = { ...stops[0], color: hex };
      else stops[stops.length - 1] = { ...stops[stops.length - 1], color: hex };
    }
    updateStops(serializeStops(stops), which);
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

  const selectionIsProxy = selectionCount === 1 && isNxFxProxy(selectedShapes[0]);

  return (
    <DefaultStylePanel {...props}>
      <div className="nx-vsp">
        {showActionsWithVectorize ? (
          <ActionsSection
            editor={editor}
            selectionCount={selectionCount}
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
          />
        ) : null}

        <OpacitySection
          value={opacityValue}
          onChange={(v) => {
            const vv = clamp01(v);
            try {
              editor.setOpacityForSelectedShapes(vv);
              editor.setOpacityForNextShapes(vv);
            } catch {
              // ignore
            }
          }}
        />

        {fxTargets.length ? (
          <>
            {hasFxOnSelection && firstFxTarget ? (
              <div className="nx-vsp-section">
                <div className="nx-vsp-title">FX</div>
                <div className="nx-vsp-group">
                  <div className="nx-vsp-row">
                    <div className="nx-vsp-icon">✦</div>
                    <button
                      type="button"
                      className="nx-vsp-miniBtn flex-1"
                      onClick={() => {
                        try {
                          toggleNxFxEditMode(editor as any, String(firstFxTarget.id) as any);
                        } catch {
                          // ignore
                        }
                      }}
                    >
                      Toggle edit contents
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

            <NxFxEffectsSection
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
            />

            <NxFxDistortionSection
              fx={firstFx as any}
              onChangeFx={(next) => setFxForTargets(next)}
              onAdd={(kind) => {
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
          </>
        ) : null}

        {nxPaths.length > 0 ? (
          <>
            <NxRectPaintSection
              title="Fill"
              icon="F"
              mode={nxFillMode as any}
              solid={nxFillSolid}
              a={nxFillA}
              b={nxFillB}
              angle={nxFillAngle}
              pattern={nxFillPattern as any}
              stopsJson={nxFillStopsJson}
              showAngle={false}
              onChangeMode={(m) => updateNxProps((prev) => ({ ...prev, fillMode: m }))}
              onChangeSolid={(hex) => updateNxProps((prev) => ({ ...prev, fill: hex }))}
              onChangeA={(hex) => updateNxProps((prev) => ({ ...prev, fillA: hex }))}
              onChangeB={(hex) => updateNxProps((prev) => ({ ...prev, fillB: hex }))}
              onChangeAngle={(deg) => updateNxProps((prev) => ({ ...prev, fillAngle: deg }))}
              onChangePattern={(p) => updateNxProps((prev) => ({ ...prev, fillPattern: p }))}
              onChangeStopsJson={(json) => updateNxProps((prev) => ({ ...prev, fillStops: json }))}
              onActivateGradientHandles={() => setVisionGradientUiState({ shapeId: String(firstNx?.id || ''), paint: 'fill' })}
            />

            <NxRectPaintSection
              title="Outline"
              icon="O"
              mode={nxStrokeMode as any}
              solid={nxStrokeSolid}
              a={nxStrokeA}
              b={nxStrokeB}
              angle={nxStrokeAngle}
              pattern={nxStrokePattern as any}
              stopsJson={nxStrokeStopsJson}
              showAngle={false}
              onChangeMode={(m) => updateNxProps((prev) => ({ ...prev, strokeMode: m }))}
              onChangeSolid={(hex) => updateNxProps((prev) => ({ ...prev, stroke: hex }))}
              onChangeA={(hex) => updateNxProps((prev) => ({ ...prev, strokeA: hex }))}
              onChangeB={(hex) => updateNxProps((prev) => ({ ...prev, strokeB: hex }))}
              onChangeAngle={(deg) => updateNxProps((prev) => ({ ...prev, strokeAngle: deg }))}
              onChangePattern={(p) => updateNxProps((prev) => ({ ...prev, strokePattern: p }))}
              onChangeStopsJson={(json) => updateNxProps((prev) => ({ ...prev, strokeStops: json }))}
              onActivateGradientHandles={() => setVisionGradientUiState({ shapeId: String(firstNx?.id || ''), paint: 'stroke' })}
            />

            <RectCornerRoundnessSection
              editor={editor}
              shape={firstNx}
              editable={editable as any}
              selectedNodeId={selectedNodeId}
              vectorPenActive={vectorPenActive}
            />
          </>
        ) : null}

        {nxRects.length > 0 ? (
          <>
            <NxRectCornersSection
              radiusUniform={!!nxRects[0]?.props?.radiusUniform}
              radius={Number(nxRects[0]?.props?.radius ?? 0) || 0}
              rtl={Number(nxRects[0]?.props?.radiusTL ?? nxRects[0]?.props?.radius ?? 0) || 0}
              rtr={Number(nxRects[0]?.props?.radiusTR ?? nxRects[0]?.props?.radius ?? 0) || 0}
              rbr={Number(nxRects[0]?.props?.radiusBR ?? nxRects[0]?.props?.radius ?? 0) || 0}
              rbl={Number(nxRects[0]?.props?.radiusBL ?? nxRects[0]?.props?.radius ?? 0) || 0}
              onSetUniformRadius={(r) =>
                updateNxRectProps((prev) => ({
                  ...prev,
                  radiusUniform: true,
                  radius: r,
                  radiusTL: r,
                  radiusTR: r,
                  radiusBR: r,
                  radiusBL: r,
                }))
              }
              onSetCorners={(next) =>
                updateNxRectProps((prev) => ({
                  ...prev,
                  radiusUniform: next.uniform,
                  radius: next.uniform ? next.rtl : prev.radius,
                  radiusTL: next.rtl,
                  radiusTR: next.rtr,
                  radiusBR: next.rbr,
                  radiusBL: next.rbl,
                }))
              }
            />

            <NxRectLabelSection
              label={String(nxRects[0]?.props?.label || '')}
              labelSize={Number(nxRects[0]?.props?.labelSize ?? 18) || 18}
              labelAlign={String(nxRects[0]?.props?.labelAlign || 'center') as any}
              labelColor={String(nxRects[0]?.props?.labelColor || '#111111')}
              onChangeLabel={(s) => updateNxRectProps((prev) => ({ ...prev, label: s }))}
              onChangeLabelSize={(n) => updateNxRectProps((prev) => ({ ...prev, labelSize: n }))}
              onChangeLabelAlign={(a) => updateNxRectProps((prev) => ({ ...prev, labelAlign: a }))}
              onChangeLabelColor={(hex) => updateNxRectProps((prev) => ({ ...prev, labelColor: hex }))}
            />

            <NxRectStrokeSidesSection
              uniform={!!nxRects[0]?.props?.strokeUniform}
              width={Number(nxRects[0]?.props?.strokeWidth ?? 1) || 1}
              top={Number(nxRects[0]?.props?.strokeTop ?? nxRects[0]?.props?.strokeWidth ?? 1) || 1}
              right={Number(nxRects[0]?.props?.strokeRight ?? nxRects[0]?.props?.strokeWidth ?? 1) || 1}
              bottom={Number(nxRects[0]?.props?.strokeBottom ?? nxRects[0]?.props?.strokeWidth ?? 1) || 1}
              left={Number(nxRects[0]?.props?.strokeLeft ?? nxRects[0]?.props?.strokeWidth ?? 1) || 1}
              onSetUniform={(v) =>
                updateNxRectProps((prev) => ({
                  ...prev,
                  strokeUniform: v,
                }))
              }
              onSetAll={(w) =>
                updateNxRectProps((prev) => ({
                  ...prev,
                  strokeWidth: w,
                  strokeTop: w,
                  strokeRight: w,
                  strokeBottom: w,
                  strokeLeft: w,
                }))
              }
              onSetSides={(next) =>
                updateNxRectProps((prev) => ({
                  ...prev,
                  strokeTop: next.top,
                  strokeRight: next.right,
                  strokeBottom: next.bottom,
                  strokeLeft: next.left,
                }))
              }
            />

            <NxRectPaintSection
              title="Fill"
              icon="F"
              mode={(nxRects[0]?.props?.fillMode || 'solid') as any}
              solid={String(nxRects[0]?.props?.fill || '#ffffff')}
              a={String(nxRects[0]?.props?.fillA || nxRects[0]?.props?.fill || '#ffffff')}
              b={String(nxRects[0]?.props?.fillB || '#111111')}
              angle={Number(nxRects[0]?.props?.fillAngle ?? 45) || 45}
              pattern={(nxRects[0]?.props?.fillPattern || 'stripes') as any}
              stopsJson={String(nxRects[0]?.props?.fillStops || '')}
              showAngle={false}
              onChangeMode={(m) => updateNxRectProps((prev) => ({ ...prev, fillMode: m }))}
              onChangeSolid={(hex) => updateNxRectProps((prev) => ({ ...prev, fill: hex }))}
              onChangeA={(hex) => updateNxRectProps((prev) => ({ ...prev, fillA: hex }))}
              onChangeB={(hex) => updateNxRectProps((prev) => ({ ...prev, fillB: hex }))}
              onChangeAngle={(deg) => updateNxRectProps((prev) => ({ ...prev, fillAngle: deg }))}
              onChangePattern={(p) => updateNxRectProps((prev) => ({ ...prev, fillPattern: p }))}
              onChangeStopsJson={(json) => updateNxRectProps((prev) => ({ ...prev, fillStops: json }))}
              onActivateGradientHandles={() =>
                setVisionGradientUiState({ shapeId: String(nxRects[0]?.id || ''), paint: 'fill' })
              }
            />

            <NxRectPaintSection
              title="Outline"
              icon="O"
              mode={(nxRects[0]?.props?.strokeMode || 'solid') as any}
              solid={String(nxRects[0]?.props?.stroke || '#111111')}
              a={String(nxRects[0]?.props?.strokeA || nxRects[0]?.props?.stroke || '#111111')}
              b={String(nxRects[0]?.props?.strokeB || '#ffffff')}
              angle={Number(nxRects[0]?.props?.strokeAngle ?? 45) || 45}
              pattern={(nxRects[0]?.props?.strokePattern || 'dots') as any}
              stopsJson={String(nxRects[0]?.props?.strokeStops || '')}
              showAngle={false}
              onChangeMode={(m) => updateNxRectProps((prev) => ({ ...prev, strokeMode: m }))}
              onChangeSolid={(hex) => updateNxRectProps((prev) => ({ ...prev, stroke: hex }))}
              onChangeA={(hex) => updateNxRectProps((prev) => ({ ...prev, strokeA: hex }))}
              onChangeB={(hex) => updateNxRectProps((prev) => ({ ...prev, strokeB: hex }))}
              onChangeAngle={(deg) => updateNxRectProps((prev) => ({ ...prev, strokeAngle: deg }))}
              onChangePattern={(p) => updateNxRectProps((prev) => ({ ...prev, strokePattern: p }))}
              onChangeStopsJson={(json) => updateNxRectProps((prev) => ({ ...prev, strokeStops: json }))}
              onActivateGradientHandles={() =>
                setVisionGradientUiState({ shapeId: String(nxRects[0]?.id || ''), paint: 'stroke' })
              }
            />
          </>
        ) : null}

        {nxTexts.length > 0 ? (
          <>
            <NxTextTypographySection
              text={String(nxTexts[0]?.props?.text || '')}
              fontSize={Number(nxTexts[0]?.props?.fontSize ?? 32) || 32}
              align={String(nxTexts[0]?.props?.align || 'center') as any}
              fontFamily={String(nxTexts[0]?.props?.fontFamily || 'Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif')}
              onChangeText={(s) => updateNxTextProps((prev) => ({ ...prev, text: s }))}
              onChangeFontSize={(n) => updateNxTextProps((prev) => ({ ...prev, fontSize: n }))}
              onChangeAlign={(a) => updateNxTextProps((prev) => ({ ...prev, align: a }))}
              onChangeFontFamily={(f) => updateNxTextProps((prev) => ({ ...prev, fontFamily: f }))}
            />

            <NxRectPaintSection
              title="Text fill"
              icon="∎"
              mode={String(nxTexts[0]?.props?.fillMode || 'solid') as any}
              solid={String(nxTexts[0]?.props?.fill || '#111111')}
              a={parseStopsJson(String(nxTexts[0]?.props?.fillStops || ''), String(nxTexts[0]?.props?.fill || '#111111'), '#1a73e8')[0]?.color || '#111111'}
              b={
                parseStopsJson(String(nxTexts[0]?.props?.fillStops || ''), String(nxTexts[0]?.props?.fill || '#111111'), '#1a73e8').slice(-1)[0]
                  ?.color || '#1a73e8'
              }
              angle={45}
              pattern={String(nxTexts[0]?.props?.fillPattern || 'stripes') as any}
              stopsJson={String(nxTexts[0]?.props?.fillStops || '')}
              showAngle={false}
              onChangeMode={(m) => updateNxTextProps((prev) => ({ ...prev, fillMode: m }))}
              onChangeSolid={(hex) => updateNxTextProps((prev) => ({ ...prev, fill: hex }))}
              onChangeA={(hex) => updateStopEnd('fill', 'a', hex)}
              onChangeB={(hex) => updateStopEnd('fill', 'b', hex)}
              onChangeAngle={() => {}}
              onChangePattern={(p) => updateNxTextProps((prev) => ({ ...prev, fillPattern: p }))}
              onChangeStopsJson={(json) => updateNxTextProps((prev) => ({ ...prev, fillStops: json }))}
              onActivateGradientHandles={() => setVisionGradientUiState({ shapeId: String(nxTexts[0]?.id || ''), paint: 'fill' })}
            />

            <NxRectPaintSection
              title="Text outline"
              icon="⟂"
              mode={String(nxTexts[0]?.props?.strokeMode || 'solid') as any}
              solid={String(nxTexts[0]?.props?.stroke || '#000000')}
              a={
                parseStopsJson(String(nxTexts[0]?.props?.strokeStops || ''), String(nxTexts[0]?.props?.stroke || '#000000'), '#000000')[0]?.color ||
                '#000000'
              }
              b={
                parseStopsJson(String(nxTexts[0]?.props?.strokeStops || ''), String(nxTexts[0]?.props?.stroke || '#000000'), '#000000').slice(-1)[0]
                  ?.color || '#000000'
              }
              angle={45}
              pattern={String(nxTexts[0]?.props?.strokePattern || 'dots') as any}
              stopsJson={String(nxTexts[0]?.props?.strokeStops || '')}
              showAngle={false}
              onChangeMode={(m) => updateNxTextProps((prev) => ({ ...prev, strokeMode: m }))}
              onChangeSolid={(hex) => updateNxTextProps((prev) => ({ ...prev, stroke: hex }))}
              onChangeA={(hex) => updateStopEnd('stroke', 'a', hex)}
              onChangeB={(hex) => updateStopEnd('stroke', 'b', hex)}
              onChangeAngle={() => {}}
              onChangePattern={(p) => updateNxTextProps((prev) => ({ ...prev, strokePattern: p }))}
              onChangeStopsJson={(json) => updateNxTextProps((prev) => ({ ...prev, strokeStops: json }))}
              onActivateGradientHandles={() => setVisionGradientUiState({ shapeId: String(nxTexts[0]?.id || ''), paint: 'stroke' })}
            />

            <div className="nx-vsp-section">
              <div className="nx-vsp-title">Outline width</div>
              <div className="nx-vsp-group">
                <div className="nx-vsp-stack">
                  <div className="nx-vsp-row">
                    <div className="nx-vsp-icon">⟂</div>
                    <input
                      className="nx-vsp-number w-[96px]"
                      type="number"
                      min={0}
                      max={128}
                      value={Math.round(Number(nxTexts[0]?.props?.strokeWidth ?? 0) || 0)}
                      onChange={(e) =>
                        updateNxTextProps((prev) => ({
                          ...prev,
                          strokeWidth: Math.max(0, Math.min(128, Math.round(Number(e.target.value || 0)))),
                        }))
                      }
                      title="Outline width"
                    />
                    <div className="nx-vsp-hint flex-1">px</div>
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : null}

        {!hasVisionSelection ? (
          <>
            <TldrawFillSection
              color={tldrawFillHex}
              mixed={sharedColor?.type === 'mixed'}
              placeholder={sharedColor?.type === 'mixed' ? 'mixed' : '#rrggbb'}
              fillStyle={fillStyle}
              onPickColor={(hex) => setPrimaryColorFromHex(hex, fillVariant)}
              onCommitHex={(hex) => setPrimaryColorFromHex(hex, fillVariant)}
              onChangeFillStyle={(v) => {
                try {
                  editor.setStyleForSelectedShapes(DefaultFillStyle as any, v as any);
                  editor.setStyleForNextShapes(DefaultFillStyle as any, v as any);
                } catch {
                  // ignore
                }
              }}
            />

            <TldrawOutlineSection
              color={tldrawOutlineHex}
              mixed={sharedColor?.type === 'mixed'}
              placeholder={sharedColor?.type === 'mixed' ? 'mixed' : '#rrggbb'}
              sizeNumber={sizeNumber}
              dashStyle={dashStyle}
              onPickColor={(hex) => setPrimaryColorFromHex(hex, 'solid')}
              onCommitHex={(hex) => setPrimaryColorFromHex(hex, 'solid')}
              onChangeSizeNumber={(n) => {
                const nn = Math.max(1, Math.min(4, Math.round(Number(n || 2))));
                const token = sizeTokenFromNumber(nn);
                try {
                  editor.setStyleForSelectedShapes(DefaultSizeStyle as any, token as any);
                  editor.setStyleForNextShapes(DefaultSizeStyle as any, token as any);
                } catch {
                  // ignore
                }
              }}
              onChangeDashStyle={(v) => {
                try {
                  editor.setStyleForSelectedShapes(DefaultDashStyle as any, v as any);
                  editor.setStyleForNextShapes(DefaultDashStyle as any, v as any);
                } catch {
                  // ignore
                }
              }}
            />

            <TldrawTextSection
              color={tldrawTextHex}
              mixed={sharedLabelColor?.type === 'mixed' || sharedColor?.type === 'mixed'}
              placeholder={sharedLabelColor?.type === 'mixed' || sharedColor?.type === 'mixed' ? 'mixed' : '#rrggbb'}
              sizeNumber={sizeNumber}
              onPickColor={(hex) => setTextColorFromHex(hex)}
              onCommitHex={(hex) => setTextColorFromHex(hex)}
              onChangeSizeNumber={(n) => {
                const nn = Math.max(1, Math.min(4, Math.round(Number(n || 2))));
                const token = sizeTokenFromNumber(nn);
                try {
                  editor.setStyleForSelectedShapes(DefaultSizeStyle as any, token as any);
                  editor.setStyleForNextShapes(DefaultSizeStyle as any, token as any);
                } catch {
                  // ignore
                }
              }}
            />
          </>
        ) : null}
      </div>
    </DefaultStylePanel>
  );
});

