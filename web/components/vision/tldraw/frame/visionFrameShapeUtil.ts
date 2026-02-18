'use client';

import { FrameShapeUtil } from 'tldraw';

/**
 * Vision wants frames to look like "standard" tldraw frames with colored headers / fills.
 *
 * In tldraw v4.x this is controlled by `FrameShapeUtil.configure({ showColors: true })`.
 * Keeping this logic in a single module makes frame behavior resilient to unrelated editor changes.
 */
export function createVisionFrameShapeUtil() {
  try {
    const cfg = (FrameShapeUtil as any)?.configure?.({ showColors: true });
    return cfg || FrameShapeUtil;
  } catch {
    return FrameShapeUtil;
  }
}

/**
 * Replace the default frame util (if present) with the Vision-configured version.
 * Accepts any array of shape utils (e.g. `defaultShapeUtils`).
 */
export function withVisionFrameShapeUtil(shapeUtils: any[]): any[] {
  const base = (Array.isArray(shapeUtils) ? shapeUtils : []).filter((u: any) => {
    const t = String((u as any)?.type ?? (u as any)?.prototype?.type ?? '');
    return t !== 'frame';
  });
  return [...base, createVisionFrameShapeUtil()];
}

