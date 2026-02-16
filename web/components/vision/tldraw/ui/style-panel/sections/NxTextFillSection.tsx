'use client';

import { ColorPickerRow, GradientStopsEditor } from '@/components/vision/tldraw/ui/style-panel/ui-primitives';
import { parseStopsJson, serializeStops } from '@/components/vision/tldraw/lib/gradient-stops';
import { toHexOrEmpty } from '@/components/vision/tldraw/ui/style-panel/color-utils';

export function NxTextFillSection({
  fillMode,
  fill,
  fillStopsJson,
  onChangeFillMode,
  onChangeFill,
  onChangeFillStopsJson,
  onActivateGradientHandles,
}: {
  fillMode: 'solid' | 'linear' | 'radial' | 'pattern';
  fill: string;
  fillStopsJson?: string;
  onChangeFillMode: (m: string) => void;
  onChangeFill: (hex: string) => void;
  onChangeFillStopsJson: (json: string) => void;
  onActivateGradientHandles?: () => void;
}) {
  return (
    <div className="nx-vsp-section">
      <div className="nx-vsp-title">Text fill</div>
      <div className="nx-vsp-group">
        <div className="nx-vsp-stack">
          <div className="nx-vsp-row">
            <div className="nx-vsp-icon">∎</div>
            <select className="nx-vsp-select flex-1" value={fillMode} onChange={(e) => onChangeFillMode(e.target.value)} title="Fill type">
              <option value="solid">Solid</option>
              <option value="linear">Linear gradient</option>
              <option value="radial">Radial gradient</option>
              <option value="pattern">Pattern</option>
            </select>
            {fillMode === 'linear' ? (
              <button
                type="button"
                className="nx-vsp-hint"
                onPointerDown={() => onActivateGradientHandles?.()}
                onClick={() => onActivateGradientHandles?.()}
                title="Click to show on-canvas handles for gradient direction"
              >
                Show handles
              </button>
            ) : null}
          </div>

          {fillMode === 'solid' ? (
            <ColorPickerRow
              icon={<span />}
              color={fill}
              onPick={(hex) => onChangeFill(toHexOrEmpty(hex) || fill)}
              onCommitHex={(hex) => onChangeFill(hex)}
            />
          ) : (
            <div onPointerDown={() => onActivateGradientHandles?.()} onFocus={() => onActivateGradientHandles?.()}>
              <GradientStopsEditor
                stops={parseStopsJson(fillStopsJson, fill, '#1a73e8')}
                onChangeStops={(next) => onChangeFillStopsJson(serializeStops(next))}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

