'use client';

import { NX_CORE_SECTION_META_KEY } from '@/components/vision/tldraw/core/visionCoreFrames';

export function getVisionActionVisibility(selectedIds: string[], selectedShapes: any[], flattenInfo: any) {
  const selectionCount = selectedIds.length;
  const only = selectionCount === 1 ? selectedShapes[0] : null;
  const selectedIsGroup = selectionCount === 1 && String(only?.type || '') === 'group';
  const selectedIsFrame = selectionCount === 1 && String(only?.type || '') === 'frame';
  const selectedIsCoreFrame = selectedIsFrame && Boolean((only?.meta as any)?.[NX_CORE_SECTION_META_KEY]);
  const selectedIsBooleanish = !!flattenInfo; // boolean result or boolean bundle group

  const showUngroup = selectedIsGroup || selectedIsBooleanish;
  const showFlatten = !!flattenInfo;
  const showUnframe = selectedIsFrame && !selectedIsCoreFrame;
  const showActions = selectionCount >= 2 || showUngroup || showFlatten || showUnframe;

  return { selectionCount, showUngroup, showFlatten, showUnframe, showActions };
}

