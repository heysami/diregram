'use client';

import { SlidersHorizontal } from 'lucide-react';

export function OpacitySection({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="nx-vsp-section">
      <div className="nx-vsp-title">Opacity</div>
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
    </div>
  );
}

