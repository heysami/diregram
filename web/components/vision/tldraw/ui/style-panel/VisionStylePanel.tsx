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
import { VisionFrameTypeSections } from '@/components/vision/tldraw/ui/style-panel/sections/VisionFrameTypeSections';
import { VisionRectLabelSection } from '@/components/vision/tldraw/ui/style-panel/sections/VisionRectLabelSection';
import { NxLayoutContainerSection } from '@/components/vision/tldraw/ui/style-panel/sections/NxLayoutContainerSection';
import { NxLayoutChildSection } from '@/components/vision/tldraw/ui/style-panel/sections/NxLayoutChildSection';
import { NX_CORE_SECTION_META_KEY } from '@/components/vision/tldraw/core/visionCoreFrames';

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
  const only = selectionCount === 1 ? selectedShapes[0] : null;
  const selectedIsGroup = selectionCount === 1 && String(only?.type || '') === 'group';
  const selectedIsNxLayout = selectionCount === 1 && String(only?.type || '') === 'nxlayout';
  const selectedIsFrame = selectionCount === 1 && String(only?.type || '') === 'frame';
  const selectedIsCoreSection = selectionCount === 1 && Boolean((only?.meta as any)?.[NX_CORE_SECTION_META_KEY]);
  const selectedIsCoreContainer = selectedIsCoreSection && (selectedIsFrame || selectedIsNxLayout);
  const selectedIsFrameLike = selectedIsFrame || selectedIsCoreContainer;

  const nxLayoutSelectedAsChildCtx = (() => {
    if (!selectedIsNxLayout || !only) return null;
    const pid = String((only as any)?.parentId || '');
    if (!pid.startsWith('shape:')) return null;
    try {
      const p: any = editor.getShape(pid as any);
      if (p && String(p.type || '') === 'nxlayout') return { parent: p, target: only };
    } catch {
      // ignore
    }
    return null;
  })();

  const nxLayoutChildCtx = (() => {
    if (selectionCount < 1) return null;
    if (!selectedShapes.length) return null;
    const hasNxlayoutInSelection = selectedShapes.some((s) => String(s?.type || '') === 'nxlayout');
    // Special case: selected shape(s) are `nxlayout` themselves. Allow `nxlayout` to act as a child of another `nxlayout`.
    if (hasNxlayoutInSelection) {
      const allAreNxlayout = selectedShapes.every((s) => String(s?.type || '') === 'nxlayout');
      if (!allAreNxlayout) return null;

      const parentIds = Array.from(
        new Set(
          selectedShapes
            .map((s) => String((s as any)?.parentId || ''))
            .filter((pid) => pid.startsWith('shape:')),
        ),
      );
      if (parentIds.length !== 1) return null;
      const parentId = parentIds[0];
      let parentShape: any = null;
      try {
        parentShape = editor.getShape(parentId as any);
      } catch {
        parentShape = null;
      }
      if (!parentShape || String(parentShape.type || '') !== 'nxlayout') return null;
      return { parent: parentShape, targets: selectedShapes };
    }

    const getParentCandidates = (pidRaw: any): string[] => {
      const pid = String(pidRaw || '');
      if (!pid) return [];
      // Prefer canonical TLShapeId form (what `getSelectedShapeIds` returns).
      if (pid.startsWith('shape:')) return [pid, pid.slice('shape:'.length)];
      // Some codepaths may store raw ids; tolerate and also try shape:-prefixed.
      return [pid, `shape:${pid}`];
    };

    const findNxLayoutAncestor = (shape: any): any | null => {
      let cur: any = shape;
      const chain: string[] = [];
      for (let i = 0; i < 32; i++) {
        const pidStr = String(cur?.parentId || '');
        chain.push(pidStr);
        if (!pidStr) return null;
        // Stop at page/unknown parents.
        if (pidStr.startsWith('page:')) return null;
        if (!pidStr.startsWith('shape:') && !pidStr.includes(':')) return null;
        let p: any = null;
        const candidates = getParentCandidates(pidStr);
        for (const cand of candidates) {
          if (p) break;
          try {
            p = editor.getShape(cand as any);
          } catch {
            p = null;
          }
        }
        if (!p) return null;
        if (String(p.type || '') === 'nxlayout') return p;
        cur = p;
      }
      return null;
    };

    const parents = selectedShapes.map((s) => findNxLayoutAncestor(s)).filter(Boolean) as any[];
    if (parents.length !== selectedShapes.length) return null;
    const firstId = String(parents[0]?.id || '');
    if (!firstId) return null;
    if (parents.some((p) => String(p?.id || '') !== firstId)) return null;
    return { parent: parents[0], targets: selectedShapes };
  })();

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

  const supportsFxProxy = (() => {
    try {
      return Boolean((editor as any).hasShapeUtil?.('nxfx'));
    } catch {
      return false;
    }
  })();

  const flattenInfo = getFlattenInfoFromSelection(editor, selectedIds);
  const canBoolean = selectionCount >= 2;
  const canVectorize = selectionCount === 1 ? canConvertSelectionToVectorPoints(editor) : false;

  const { showActions, showFlatten, showUngroup, showUnframe } = getVisionActionVisibility(selectedIds, selectedShapes, flattenInfo);
  const showActionsWithVectorize = showActions || canVectorize;

  const theme = makeTheme(editor);
  const fillVariant = getFillVariant(fillStyle);

  // Hide the entire right panel when nothing is selected.
  // (Must be after hooks so hook order is stable across renders.)
  if (selectionCount === 0) return null;

  const setPrimaryColorFromHex = (hex: string, variant: 'fill' | 'semi' | 'pattern' | 'solid') => {
    const token = nearestTokenForHex({ theme, hex, variant });
    if (!token) return;
    try {
      editor.setStyleForSelectedShapes(DefaultColorStyle as any, token as any);
      editor.setStyleForNextShapes(DefaultColorStyle as any, token as any);
    } catch {
      // ignore
    }

    // Frames in this app behave more reliably when their `props.color` is also patched.
    // (Some tldraw frame codepaths read directly from props, not only from shared styles.)
    try {
      const frames = (Array.isArray(selectedShapes) ? selectedShapes : []).filter((s) => String(s?.type || '') === 'frame');
      if (!frames.length) return;
      editor.updateShapes(
        frames.map((f: any) => ({
          id: f.id,
          type: f.type,
          props: { ...(f.props || {}), color: token },
        })) as any,
      );
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

  const getShapeLabel = (id: string): string => {
    const sid = String(id || '');
    if (!sid) return '';
    try {
      const s: any = editor.getShape(sid as any);
      if (!s) return sid;
      const m: any = s.meta || {};
      if (typeof m.nxName === 'string' && m.nxName.trim()) return m.nxName.trim();
      if (String(s.type || '') === 'text') {
        const p: any = s.props || {};
        if (typeof p.text === 'string' && p.text.trim()) return p.text.trim().slice(0, 24);
      }
      return String(s.type || sid);
    } catch {
      return sid;
    }
  };

  const patchFxForShapeIds = (ids: string[], patch: (prevFx: any) => any) => {
    if (!ids.length) return;
    const updates: any[] = [];
    for (const id of ids) {
      if (!id) continue;
      let s: any = null;
      try {
        s = editor.getShape(id as any);
      } catch {
        s = null;
      }
      if (!s) continue;
      const prevFx = readNxFxFromMeta(s.meta) || makeEmptyNxFx();
      const nextFx = coerceNxFx(patch(prevFx));
      updates.push({ id: s.id, type: s.type, meta: writeNxFxToMeta(s.meta, nextFx) } as any);
    }
    if (!updates.length) return;
    try {
      editor.updateShapes(updates as any);
    } catch {
      // ignore
    }
  };

  const onlyMaskDistortion = (() => {
    if (!supportsFxProxy) return null;
    if (selectionCount !== 1) return null;
    const s: any = panelTargets[0] || only;
    if (!s) return null;
    const fx = readNxFxFromMeta(s.meta) || null;
    const ds = Array.isArray((fx as any)?.distortions) ? (fx as any).distortions : [];
    const m = ds.find((d: any) => d && d.kind === 'mask' && d.enabled !== false) || null;
    if (!m || typeof m.sourceId !== 'string' || !m.sourceId) return null;
    return m as any;
  })();

  return (
    <DefaultStylePanel {...props}>
      <div className="nx-vsp">
        <VisionLayerSection
          editor={editor}
          selectionCount={selectionCount}
          showActionsWithVectorize={showActionsWithVectorize}
          showUngroup={showUngroup}
          showUnframe={showUnframe}
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
          onUnframe={() => {
            try {
              const ids = editor.getSelectedShapeIds();
              if (!ids || ids.length !== 1) return;
              const id = ids[0] as any;
              const frame: any = editor.getShape(id);
              if (!frame || String(frame.type || '') !== 'frame') return;
              if (Boolean(frame?.meta?.[NX_CORE_SECTION_META_KEY])) return;

              const childIds = ((editor as any).getSortedChildIdsForParent?.(frame.id as any) || []).filter(Boolean);
              try {
                if (childIds.length) editor.reparentShapes(childIds as any, frame.parentId as any);
              } catch {
                // ignore
              }
              try {
                editor.deleteShapes([frame.id as any]);
              } catch {
                // ignore
              }
              try {
                if (childIds.length) editor.setSelectedShapes(childIds as any);
              } catch {
                // ignore
              }
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
          mask={
            selectedIsFrameLike
              ? null
              : supportsFxProxy
                ? {
                  supportsFxProxy,
                  canApply: selectionCount >= 2,
                  hasMask: Boolean(onlyMaskDistortion),
                  maskSourceLabel: onlyMaskDistortion ? getShapeLabel(String((onlyMaskDistortion as any).sourceId || '')) : '',
                  mode: String((onlyMaskDistortion as any)?.mode || 'alpha') === 'shape' ? 'shape' : 'alpha',
                  invert: Boolean((onlyMaskDistortion as any)?.invert),
                  strength: clamp01(Number((onlyMaskDistortion as any)?.strength ?? 1)),
                  onApply: () => {
                    if (selectionCount < 2) return;
                    const ids = editor.getSelectedShapeIds().map(String);
                    if (ids.length < 2) return;
                    const maskId = String(ids[ids.length - 1] || '');
                    if (!maskId) return;
                    const targets = ids.slice(0, -1).filter((id) => id && id !== maskId);
                    if (!targets.length) return;
                    // Default to fast vector "shape" masking only when the mask source is a supported Vision vector shape.
                    // Otherwise default to alpha mode (raster proxy) so masking still works for arbitrary shapes.
                    let defaultMode: 'shape' | 'alpha' = 'alpha';
                    try {
                      const ms: any = editor.getShape(maskId as any);
                      const t = String(ms?.type || '');
                      if (t === 'nxrect' || t === 'nxpath') defaultMode = 'shape';
                    } catch {
                      defaultMode = 'alpha';
                    }
                    patchFxForShapeIds(targets, (prevFx) => {
                      const prevDs = Array.isArray((prevFx as any)?.distortions) ? (prevFx as any).distortions : [];
                      const nextDs = [
                        ...prevDs.filter((d: any) => !(d && d.kind === 'mask')),
                        { id: makeFxId('mask'), kind: 'mask', enabled: true, sourceId: maskId, mode: defaultMode, invert: false, strength: 1 },
                      ];
                      return { ...(prevFx as any), distortions: nextDs };
                    });
                  },
                  onClear: () => {
                    if (selectionCount !== 1) return;
                    const ids = editor.getSelectedShapeIds().map(String);
                    const id = String(ids[0] || '');
                    if (!id) return;
                    patchFxForShapeIds([id], (prevFx) => {
                      const prevDs = Array.isArray((prevFx as any)?.distortions) ? (prevFx as any).distortions : [];
                      const nextDs = prevDs.filter((d: any) => !(d && d.kind === 'mask'));
                      return { ...(prevFx as any), distortions: nextDs };
                    });
                  },
                  onChangeMode: (m) => {
                    if (selectionCount !== 1) return;
                    const ids = editor.getSelectedShapeIds().map(String);
                    const id = String(ids[0] || '');
                    if (!id) return;
                    patchFxForShapeIds([id], (prevFx) => {
                      const prevDs = Array.isArray((prevFx as any)?.distortions) ? (prevFx as any).distortions : [];
                      const nextDs = prevDs.map((d: any) => (d && d.kind === 'mask' ? { ...d, mode: m } : d));
                      return { ...(prevFx as any), distortions: nextDs };
                    });
                  },
                  onChangeInvert: (v) => {
                    if (selectionCount !== 1) return;
                    const ids = editor.getSelectedShapeIds().map(String);
                    const id = String(ids[0] || '');
                    if (!id) return;
                    patchFxForShapeIds([id], (prevFx) => {
                      const prevDs = Array.isArray((prevFx as any)?.distortions) ? (prevFx as any).distortions : [];
                      const nextDs = prevDs.map((d: any) => (d && d.kind === 'mask' ? { ...d, invert: Boolean(v) } : d));
                      return { ...(prevFx as any), distortions: nextDs };
                    });
                  },
                  onChangeStrength: (v) => {
                    if (selectionCount !== 1) return;
                    const ids = editor.getSelectedShapeIds().map(String);
                    const id = String(ids[0] || '');
                    if (!id) return;
                    const vv = clamp01(Number(v));
                    patchFxForShapeIds([id], (prevFx) => {
                      const prevDs = Array.isArray((prevFx as any)?.distortions) ? (prevFx as any).distortions : [];
                      const nextDs = prevDs.map((d: any) => (d && d.kind === 'mask' ? { ...d, strength: vv } : d));
                      return { ...(prevFx as any), distortions: nextDs };
                    });
                  },
                  }
                : null
          }
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

        {/* NxLayout container + child controls */}
        {selectedIsNxLayout && only ? (
          <NxLayoutContainerSection
            editor={editor}
            shape={only as any}
            inParent={nxLayoutSelectedAsChildCtx ? (nxLayoutSelectedAsChildCtx as any).parent : null}
            hideLayout={selectedIsCoreContainer}
            onActivateFillHandles={(layerId) =>
              setVisionGradientUiState({ shapeId: String((only as any)?.id || ''), paint: 'fill', layerId })
            }
            onActivateStrokeHandles={(layerId) =>
              setVisionGradientUiState({ shapeId: String((only as any)?.id || ''), paint: 'stroke', layerId })
            }
          />
        ) : null}
        {nxLayoutChildCtx && !selectedIsNxLayout ? (
          <NxLayoutChildSection editor={editor} targets={(nxLayoutChildCtx as any).targets} parent={(nxLayoutChildCtx as any).parent} />
        ) : null}

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
          enabled={!hasVisionSelection && !selectedIsGroup && !selectedIsNxLayout && !selectedIsFrame}
          showText={!selectedIsFrameLike}
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

        <VisionFrameTypeSections
          enabled={selectedIsFrame && !!only}
          editor={editor}
          frameShape={only as any}
          theme={theme}
          currentColorHex={tldrawOutlineHex}
          colorMixed={sharedColor?.type === 'mixed'}
          colorPlaceholder={sharedColor?.type === 'mixed' ? 'mixed' : '#rrggbb'}
        />

        {/* FX (applies to any selection target) */}
        <VisionFxSections
          enabled={fxTargets.length > 0 && !selectedIsFrameLike}
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

