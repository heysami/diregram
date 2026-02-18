import type { Editor } from 'tldraw';
import { readNxFxFromMeta } from '@/components/vision/tldraw/fx/nxfxTypes';
import { collectAllDescendants, isGroupLike, safeStringify } from '@/components/vision/tldraw/fx/proxy/proxyUtil';

export function computeRenderSignature(editor: Editor, source: any): string {
  const fx = readNxFxFromMeta(source?.meta);
  const fxSig = safeStringify(fx);
  const rot = Number.isFinite(source?.rotation) ? Number(source.rotation) : 0;
  // NOTE: by default exclude translation (x/y) so dragging doesn't trigger re-render.
  // HOWEVER: for alpha-masking, translation *does* affect the result (relative to the mask source),
  // so we include it when an enabled mask is in `mode !== 'shape'`.
  const propsSig = isGroupLike(source) ? '' : safeStringify(source?.props || {});
  const includeTranslation = (() => {
    const ds = Array.isArray((fx as any)?.distortions) ? (fx as any).distortions : [];
    return ds.some((d: any) => d && d.kind === 'mask' && d.enabled !== false && String(d.mode || 'alpha') !== 'shape');
  })();
  const tx = includeTranslation && Number.isFinite(source?.x) ? Number(source.x) : 0;
  const ty = includeTranslation && Number.isFinite(source?.y) ? Number(source.y) : 0;
  const tSig = includeTranslation ? `t(${tx.toFixed(2)},${ty.toFixed(2)})|` : '';

  const shapeSig = (s: any): string => {
    if (!s?.id) return '';
    const id = String(s.id);
    const opacity = Number.isFinite(s.opacity) ? Number(s.opacity) : 1;
    const r = Number.isFinite(s.rotation) ? Number(s.rotation) : 0;
    const x = Number.isFinite(s.x) ? Number(s.x) : 0;
    const y = Number.isFinite(s.y) ? Number(s.y) : 0;
    const p = isGroupLike(s) ? '' : safeStringify(s?.props || {});
    // IMPORTANT: keep this cheap (called frequently during proxy sync).
    // Include translation for mask sources so moving the mask can invalidate the target render.
    return `${id}{t(${x.toFixed(2)},${y.toFixed(2)})|o${opacity}|r${r}|p${p}}`;
  };

  // Mask dependency: include a signature of mask source shapes so masked outputs rerender
  // when the mask moves/changes (including nested children for group masks).
  const maskDeps = (() => {
    const ds = (fx && typeof fx === 'object' ? (fx as any).distortions : null) as any[] | null;
    if (!Array.isArray(ds) || !ds.length) return '';
    const srcIds = Array.from(
      new Set(
        ds
          .filter((d) => d && d.kind === 'mask' && d.enabled !== false && typeof d.sourceId === 'string' && d.sourceId)
          .map((d) => String(d.sourceId)),
      ),
    );
    if (!srcIds.length) return '';
    const parts: string[] = [];
    const MAX_SHAPES = 120;
    let remaining = MAX_SHAPES;
    for (const sid of srcIds) {
      if (remaining <= 0) break;
      const s: any = (editor as any).getShape?.(sid as any);
      if (!s) {
        parts.push(`missing(${sid})`);
        continue;
      }
      if (!isGroupLike(s)) {
        parts.push(shapeSig(s));
        remaining -= 1;
        continue;
      }
      // Group mask: include group + a bounded set of descendants.
      const ids = collectAllDescendants(editor, [sid]).slice(0, Math.max(1, remaining));
      for (const id of ids) {
        if (remaining <= 0) break;
        const sh: any = (editor as any).getShape?.(id as any);
        if (!sh) continue;
        const sig = shapeSig(sh);
        if (sig) {
          parts.push(sig);
          remaining -= 1;
        }
      }
    }
    return parts.join(',');
  })();

  return `${tSig}r${rot}|fx:${fxSig}|p:${propsSig}|mask:${maskDeps}`;
}

