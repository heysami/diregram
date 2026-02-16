'use client';

import { SlidersHorizontal } from 'lucide-react';

export function OpacitySection({
  value,
  onChange,
  embedded,
}: {
  value: number;
  onChange: (v: number) => void;
  /** Render without outer section wrapper/title (for grouping under another header). */
  embedded?: boolean;
}) {
  const body = (
    <div className="nx-vsp-group">
      <div className="nx-vsp-row">
        <div className="nx-vsp-icon">
          <SlidersHorizontal size={14} />
        </div>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={value}
          onChange={(e) => onChange(Number(e.target.value || 1))}
          className="nx-vsp-range flex-1"
        />
        <div className="nx-vsp-hint tabular-nums w-[40px] text-right">{Math.round(value * 100)}%</div>
      </div>
    </div>
  );

  if (embedded) return body;
  return (
    <div className="nx-vsp-section">
      <div className="nx-vsp-title">Opacity</div>
      {body}
    </div>
  );
}

