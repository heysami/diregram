'use client';

export { isShapeRecordId, isDragging, getId } from '@/components/vision/tldraw/autoconvert/shapePredicates';
export { makeVisionRectFromGeo, isRectGeo } from '@/components/vision/tldraw/autoconvert/convertRect';
export { makeVisionEllipseFromGeo, isEllipseGeo } from '@/components/vision/tldraw/autoconvert/convertEllipse';
export { makeVisionTextFromTldrawText } from '@/components/vision/tldraw/autoconvert/convertText';
export { tryMakeVisionArrowFromTldrawArrow } from '@/components/vision/tldraw/autoconvert/convertArrow';
export { tryMakeVisionPathFromAnyTldrawShape } from '@/components/vision/tldraw/autoconvert/convertAnyToPath';
export { extractPathDFromSvg, readSvgViewBox, computeSvgPathsBBox, detectSvgFillOnlyPath } from '@/components/vision/tldraw/autoconvert/svgExtract';

