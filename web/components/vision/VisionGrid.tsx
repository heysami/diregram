'use client';

import type { VisionDoc } from '@/lib/visionjson';

export function visionCellKey(row: number, col: number) {
  return `r${row}c${col}`;
}

export function VisionGrid({
  doc,
  selectedKey,
  onSelectKey,
  tilePx = 24,
  showThumbs = false,
}: {
  doc: VisionDoc;
  selectedKey: string | null;
  onSelectKey: (key: string) => void;
  tilePx?: number;
  showThumbs?: boolean;
}) {
  const gridSize = doc.gridSize || 24;

  return (
    <div
      className="grid gap-[2px] bg-black/10 p-[2px] w-fit"
      style={{ gridTemplateColumns: `repeat(${gridSize}, ${tilePx}px)` }}
    >
      {Array.from({ length: gridSize * gridSize }).map((_, idx) => {
        const row = Math.floor(idx / gridSize) + 1;
        const col = (idx % gridSize) + 1;
        const key = visionCellKey(row, col);
        const cell = doc.cells?.[key];
        const isSel = selectedKey === key;
        const thumb = cell?.thumb;
        return (
          <button
            key={key}
            type="button"
            className={`border bg-white`}
            style={{
              height: tilePx,
              width: tilePx,
              outline: isSel ? '2px solid #000' : 'none',
              outlineOffset: isSel ? 0 : undefined,
            }}
            onClick={() => onSelectKey(key)}
            title={key}
          >
            {showThumbs && thumb ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={thumb} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

