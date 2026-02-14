import { listRecognizedMacros } from '@/lib/grid-cell-macros';
import { nxSemanticBgColor, nxSemanticTextColor } from '@/lib/grid/nxSemanticColor';

export function getCellSemanticBackground(value: string): { bg: string; fg: string } | null {
  const v = String(value || '');
  if (!v) return null;
  const ms = listRecognizedMacros(v);
  const bg = ms.find((m) => String(m.inner || '').trim().startsWith('bg:')) || null;
  if (!bg) return null;
  const inner = String(bg.inner || '').trim(); // bg:r]text or bg:r
  const bracket = inner.indexOf(']');
  const kind = inner.slice(3, bracket === -1 ? undefined : bracket).trim();
  return { bg: nxSemanticBgColor(kind), fg: nxSemanticTextColor(kind) };
}

