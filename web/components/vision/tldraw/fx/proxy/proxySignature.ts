import type { Editor } from 'tldraw';
import { readNxFxFromMeta } from '@/components/vision/tldraw/fx/nxfxTypes';
import { isGroupLike, safeStringify } from '@/components/vision/tldraw/fx/proxy/proxyUtil';

export function computeRenderSignature(editor: Editor, source: any): string {
  void editor;
  const fx = readNxFxFromMeta(source?.meta);
  const fxSig = safeStringify(fx);
  const rot = Number.isFinite(source?.rotation) ? Number(source.rotation) : 0;
  // NOTE: exclude translation (x/y) so dragging doesn't trigger re-render.
  const propsSig = isGroupLike(source) ? '' : safeStringify(source?.props || {});
  return `r${rot}|fx:${fxSig}|p:${propsSig}`;
}

