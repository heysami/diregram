'use client';

export function getVisionActionVisibility(selectedIds: string[], selectedShapes: any[], flattenInfo: any) {
  const selectionCount = selectedIds.length;
  const only = selectionCount === 1 ? selectedShapes[0] : null;
  const selectedIsGroup = selectionCount === 1 && String(only?.type || '') === 'group';
  const selectedIsBooleanish = !!flattenInfo; // boolean result or boolean bundle group

  const showUngroup = selectedIsGroup || selectedIsBooleanish;
  const showFlatten = !!flattenInfo;
  const showActions = selectionCount >= 2 || showUngroup || showFlatten;

  return { selectionCount, showUngroup, showFlatten, showActions };
}

