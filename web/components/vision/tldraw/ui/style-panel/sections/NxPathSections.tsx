'use client';

import { Droplets, PaintBucket, PenLine } from 'lucide-react';
import { ColorPickerRow, StopSwatch } from '@/components/vision/tldraw/ui/style-panel/ui-primitives';
import { toHexOrEmpty } from '@/components/vision/tldraw/ui/style-panel/color-utils';

export function NxPathFillSection({
  fillKind,
  fillAngle,
  fillSolid,
  fillA,
  fillB,
  onChangeFillKind,
  onChangeFillAngle,
  onChangeFillSolid,
  onChangeFillA,
  onChangeFillB,
}: {
  fillKind: 'solid' | 'linear' | 'radial';
  fillAngle: number;
  fillSolid: string;
  fillA: string;
  fillB: string;
  onChangeFillKind: (k: 'solid' | 'linear' | 'radial') => void;
  onChangeFillAngle: (deg: number) => void;
  onChangeFillSolid: (hex: string) => void;
  onChangeFillA: (hex: string) => void;
  onChangeFillB: (hex: string) => void;
}) {
  return (
    <div className="nx-vsp-section">
      <div className="nx-vsp-title">Fill</div>
      <div className="nx-vsp-group">
        <div className="nx-vsp-stack">
          <div className="nx-vsp-row">
            <div className="nx-vsp-icon">
              <PaintBucket size={14} />
            </div>
            <select className="nx-vsp-select flex-1" value={fillKind} onChange={(e) => onChangeFillKind(e.target.value as any)} title="Fill mode">
              <option value="solid">Solid</option>
              <option value="linear">Linear</option>
              <option value="radial">Radial</option>
            </select>
            {fillKind === 'linear' ? (
              <input
                className="nx-vsp-number w-[84px]"
                type="number"
                min={0}
                max={360}
                value={Math.round(fillAngle)}
                onChange={(e) => onChangeFillAngle(Math.max(0, Math.min(360, Number(e.target.value || 0))))}
                title="Angle"
              />
            ) : null}
          </div>

          {fillKind === 'solid' ? (
            <ColorPickerRow
              icon={<Droplets size={14} />}
              color={fillSolid}
              onPick={(hex) => onChangeFillSolid(toHexOrEmpty(hex) || fillSolid)}
              onCommitHex={(hex) => onChangeFillSolid(hex)}
            />
          ) : (
            <div className="nx-vsp-row">
              <div className="nx-vsp-icon">
                <Droplets size={14} />
              </div>
              <StopSwatch color={fillA} title="Stop A" onPick={(hex) => onChangeFillA(toHexOrEmpty(hex) || fillA)} />
              <StopSwatch color={fillB} title="Stop B" onPick={(hex) => onChangeFillB(toHexOrEmpty(hex) || fillB)} />
              <div
                className="nx-vsp-preview flex-1"
                style={{
                  backgroundImage:
                    fillKind === 'linear' ? `linear-gradient(${fillAngle}deg, ${fillA}, ${fillB})` : `radial-gradient(circle at center, ${fillA}, ${fillB})`,
                }}
                title="Gradient preview"
              >
                <span className="nx-vsp-previewLabel">
                  {fillA} → {fillB}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function NxPathOutlineSection({
  strokeKind,
  strokeAngle,
  strokeWidth,
  strokeSolid,
  strokeA,
  strokeB,
  onChangeStrokeKind,
  onChangeStrokeAngle,
  onChangeStrokeWidth,
  onChangeStrokeSolid,
  onChangeStrokeA,
  onChangeStrokeB,
}: {
  strokeKind: 'solid' | 'linear' | 'radial';
  strokeAngle: number;
  strokeWidth: number;
  strokeSolid: string;
  strokeA: string;
  strokeB: string;
  onChangeStrokeKind: (k: 'solid' | 'linear' | 'radial') => void;
  onChangeStrokeAngle: (deg: number) => void;
  onChangeStrokeWidth: (w: number) => void;
  onChangeStrokeSolid: (hex: string) => void;
  onChangeStrokeA: (hex: string) => void;
  onChangeStrokeB: (hex: string) => void;
}) {
  return (
    <div className="nx-vsp-section">
      <div className="nx-vsp-title">Outline</div>
      <div className="nx-vsp-group">
        <div className="nx-vsp-stack">
          <div className="nx-vsp-row">
            <div className="nx-vsp-icon">
              <PenLine size={14} />
            </div>
            <select className="nx-vsp-select flex-1" value={strokeKind} onChange={(e) => onChangeStrokeKind(e.target.value as any)} title="Stroke mode">
              <option value="solid">Solid</option>
              <option value="linear">Linear</option>
              <option value="radial">Radial</option>
            </select>
            {strokeKind === 'linear' ? (
              <input
                className="nx-vsp-number w-[84px]"
                type="number"
                min={0}
                max={360}
                value={Math.round(strokeAngle)}
                onChange={(e) => onChangeStrokeAngle(Math.max(0, Math.min(360, Number(e.target.value || 0))))}
                title="Angle"
              />
            ) : null}
            <input
              className="nx-vsp-number w-[76px]"
              type="number"
              min={0}
              max={64}
              value={strokeWidth}
              onChange={(e) => onChangeStrokeWidth(Math.max(0, Math.min(64, Number(e.target.value || 0))))}
              title="Thickness"
            />
          </div>

          {strokeKind === 'solid' ? (
            <ColorPickerRow
              icon={<Droplets size={14} />}
              color={strokeSolid}
              onPick={(hex) => onChangeStrokeSolid(toHexOrEmpty(hex) || strokeSolid)}
              onCommitHex={(hex) => onChangeStrokeSolid(hex)}
            />
          ) : (
            <div className="nx-vsp-row">
              <div className="nx-vsp-icon">
                <Droplets size={14} />
              </div>
              <StopSwatch color={strokeA} title="Stop A" onPick={(hex) => onChangeStrokeA(toHexOrEmpty(hex) || strokeA)} />
              <StopSwatch color={strokeB} title="Stop B" onPick={(hex) => onChangeStrokeB(toHexOrEmpty(hex) || strokeB)} />
              <div
                className="nx-vsp-preview flex-1"
                style={{
                  backgroundImage:
                    strokeKind === 'linear'
                      ? `linear-gradient(${strokeAngle}deg, ${strokeA}, ${strokeB})`
                      : `radial-gradient(circle at center, ${strokeA}, ${strokeB})`,
                }}
                title="Gradient preview"
              >
                <span className="nx-vsp-previewLabel">
                  {strokeA} → {strokeB}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

