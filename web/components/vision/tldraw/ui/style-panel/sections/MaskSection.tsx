'use client';

import { Scissors } from 'lucide-react';

export function MaskSection({
  selectionCount,
  canApply,
  hasMask,
  maskSourceLabel,
  mode,
  invert,
  strength,
  onApply,
  onClear,
  onChangeMode,
  onChangeInvert,
  onChangeStrength,
  embedded,
}: {
  selectionCount: number;
  canApply: boolean;
  hasMask: boolean;
  maskSourceLabel: string;
  mode: 'shape' | 'alpha';
  invert: boolean;
  strength: number;
  onApply: () => void;
  onClear: () => void;
  onChangeMode: (m: 'shape' | 'alpha') => void;
  onChangeInvert: (v: boolean) => void;
  onChangeStrength: (v: number) => void;
  /** Render without outer section wrapper/title (for grouping under another header). */
  embedded?: boolean;
}) {
  if (!selectionCount) return null;
  const showControls = canApply || hasMask;
  if (!showControls) return null;

  const body = (
    <div className="nx-vsp-group">
      {canApply ? (
        <>
          <div className="nx-vsp-row">
            <div className="nx-vsp-icon">
              <Scissors size={14} />
            </div>
            <button type="button" className="nx-tlui-squarebtn px-2" onClick={onApply} title="Apply alpha mask using last-selected shape">
              Mask
            </button>
            <div className="nx-vsp-hint text-xs opacity-70">Uses last-selected shape as mask</div>
          </div>
        </>
      ) : null}

      {hasMask ? (
        <>
          <div className="nx-vsp-row">
            <div className="nx-vsp-icon">
              <Scissors size={14} />
            </div>
            <div className="text-xs min-w-0 flex-1 truncate" title={maskSourceLabel}>
              Masked by <span className="font-semibold">{maskSourceLabel || 'shape'}</span>
            </div>
            <button type="button" className="nx-tlui-squarebtn px-2" onClick={onClear} title="Remove mask">
              Clear
            </button>
          </div>

          <div className="nx-vsp-row">
            <div className="nx-vsp-icon">M</div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className={mode === 'shape' ? 'nx-tlui-squarebtn px-2 outline outline-2 outline-black' : 'nx-tlui-squarebtn px-2'}
                onClick={() => onChangeMode('shape')}
                title="Mask by shape (ignore mask alpha/gradient transparency)"
              >
                Shape
              </button>
              <button
                type="button"
                className={mode === 'alpha' ? 'nx-tlui-squarebtn px-2 outline outline-2 outline-black' : 'nx-tlui-squarebtn px-2'}
                onClick={() => onChangeMode('alpha')}
                title="Mask by alpha (uses mask transparency and gradients)"
              >
                Alpha
              </button>
            </div>
          </div>

          <div className="nx-vsp-row">
            <div className="nx-vsp-icon">↺</div>
            <label className="text-xs flex items-center gap-2 select-none">
              <input type="checkbox" checked={invert} onChange={(e) => onChangeInvert(Boolean(e.target.checked))} />
              Invert
            </label>
          </div>

          <div className="nx-vsp-row">
            <div className="nx-vsp-icon">α</div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={strength}
              onChange={(e) => onChangeStrength(Number(e.target.value || 1))}
              className="nx-vsp-range flex-1"
              title="Mask strength"
            />
            <div className="nx-vsp-hint tabular-nums w-[40px] text-right">{Math.round(strength * 100)}%</div>
          </div>
        </>
      ) : null}
    </div>
  );

  if (embedded) return body;
  return (
    <div className="nx-vsp-section">
      <div className="nx-vsp-title">Mask</div>
      {body}
    </div>
  );
}

