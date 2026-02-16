'use client';

import { ColorPickerRow, GradientStopsEditor } from '@/components/vision/tldraw/ui/style-panel/ui-primitives';
import { parseStopsJson, serializeStops } from '@/components/vision/tldraw/lib/gradient-stops';
import { toHexOrEmpty } from '@/components/vision/tldraw/ui/style-panel/color-utils';

export function NxTextOutlineSection({
  strokeWidth,
  strokeMode,
  stroke,
  strokeStopsJson,
  onChangeStrokeWidth,
  onChangeStrokeMode,
  onChangeStroke,
  onChangeStrokeStopsJson,
  onActivateGradientHandles,
}: {
  strokeWidth: number;
  strokeMode: 'solid' | 'linear' | 'radial' | 'pattern';
  stroke: string;
  strokeStopsJson?: string;
  onChangeStrokeWidth: (n: number) => void;
  onChangeStrokeMode: (m: string) => void;
  onChangeStroke: (hex: string) => void;
  onChangeStrokeStopsJson: (json: string) => void;
  onActivateGradientHandles?: () => void;
}) {
  const disabled = strokeWidth <= 0;
  return (
    <div className="nx-vsp-section">
      <div className="nx-vsp-title">Text outline</div>
      <div className="nx-vsp-group">
        <div className="nx-vsp-stack">
          <div className="nx-vsp-row">
            <div className="nx-vsp-icon">⟂</div>
            <input
              className="nx-vsp-number w-[96px]"
              type="number"
              min={0}
              max={128}
              value={Math.round(strokeWidth)}
              onChange={(e) => onChangeStrokeWidth(Math.max(0, Math.min(128, Math.round(Number(e.target.value || 0)))))}
              title="Outline width"
            />
            <select className="nx-vsp-select flex-1" value={strokeMode} onChange={(e) => onChangeStrokeMode(e.target.value)} title="Outline type">
              <option value="solid">Solid</option>
              <option value="linear">Linear gradient</option>
              <option value="radial">Radial gradient</option>
              <option value="pattern">Pattern</option>
            </select>
            {strokeMode === 'linear' ? (
              <button
                type="button"
                className="nx-vsp-hint"
                onPointerDown={() => onActivateGradientHandles?.()}
                onClick={() => onActivateGradientHandles?.()}
                title="Click to show on-canvas handles for outline gradient direction"
              >
                Show handles
              </button>
            ) : null}
          </div>

          {strokeMode === 'solid' ? (
            <ColorPickerRow
              icon={<span />}
              color={stroke}
              onPick={(hex) => onChangeStroke(toHexOrEmpty(hex) || stroke)}
              onCommitHex={(hex) => onChangeStroke(hex)}
              disabled={disabled}
            />
          ) : (
            <div onPointerDown={() => onActivateGradientHandles?.()} onFocus={() => onActivateGradientHandles?.()}>
              <GradientStopsEditor
                stops={parseStopsJson(strokeStopsJson, '#000000', '#000000')}
                onChangeStops={(next) => onChangeStrokeStopsJson(serializeStops(next))}
                disabled={disabled}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

