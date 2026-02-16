'use client';

import { getFillVariant, getTldrawTokenHex, getVariantHex, makeTheme } from '@/components/vision/tldraw/ui/style-panel/color-utils';

export function getTheme(editor: any) {
  return makeTheme(editor);
}

export function tokenToSolidHex(theme: any, token: string, fallback: string) {
  return getVariantHex(theme, token, 'solid') || getTldrawTokenHex(token) || fallback;
}

export function tokenToFillHex(theme: any, token: string, fillStyle: string, fallback: string) {
  const variant = getFillVariant(fillStyle);
  return getVariantHex(theme, token, variant) || getTldrawTokenHex(token) || fallback;
}

