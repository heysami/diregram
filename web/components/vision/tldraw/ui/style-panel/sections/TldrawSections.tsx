'use client';

import { Blend, Hash, PaintBucket, PenLine, Type } from 'lucide-react';
import { ColorPickerRow } from '@/components/vision/tldraw/ui/style-panel/ui-primitives';

export function TldrawFillSection({
  color,
  mixed,
  placeholder,
  fillStyle,
  onPickColor,
  onCommitHex,
  onChangeFillStyle,
}: {
  color: string;
  mixed: boolean;
  placeholder: string;
  fillStyle: string;
  onPickColor: (hex: string) => void;
  onCommitHex: (hex: string) => void;
  onChangeFillStyle: (v: string) => void;
}) {
  return (
    <div className="nx-vsp-section">
      <div className="nx-vsp-title">Fill</div>
      <div className="nx-vsp-group">
        <div className="nx-vsp-stack">
          <ColorPickerRow icon={<PaintBucket size={14} />} color={color} mixed={mixed} placeholder={placeholder} onPick={onPickColor} onCommitHex={onCommitHex} />
          <div className="nx-vsp-row">
            <div className="nx-vsp-icon">
              <Blend size={14} />
            </div>
            <select className="nx-vsp-select flex-1" value={fillStyle || 'solid'} onChange={(e) => onChangeFillStyle(e.target.value)} title="Fill style">
              <option value="none">None</option>
              <option value="semi">Semi</option>
              <option value="solid">Solid</option>
              <option value="pattern">Pattern</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}

export function TldrawOutlineSection({
  color,
  mixed,
  placeholder,
  sizeNumber,
  dashStyle,
  onPickColor,
  onCommitHex,
  onChangeSizeNumber,
  onChangeDashStyle,
}: {
  color: string;
  mixed: boolean;
  placeholder: string;
  sizeNumber: number;
  dashStyle: string;
  onPickColor: (hex: string) => void;
  onCommitHex: (hex: string) => void;
  onChangeSizeNumber: (n: number) => void;
  onChangeDashStyle: (v: string) => void;
}) {
  return (
    <div className="nx-vsp-section">
      <div className="nx-vsp-title">Outline</div>
      <div className="nx-vsp-group">
        <div className="nx-vsp-stack">
          <ColorPickerRow icon={<PenLine size={14} />} color={color} mixed={mixed} placeholder={placeholder} onPick={onPickColor} onCommitHex={onCommitHex} />
          <div className="nx-vsp-row">
            <div className="nx-vsp-icon">
              <Hash size={14} />
            </div>
            <input
              className="nx-vsp-number w-[96px]"
              type="number"
              min={1}
              max={4}
              step={1}
              value={sizeNumber}
              onChange={(e) => onChangeSizeNumber(Number(e.target.value || 2))}
              title="Thickness (1-4)"
            />
            <select className="nx-vsp-select flex-1" value={dashStyle || 'solid'} onChange={(e) => onChangeDashStyle(e.target.value)} title="Line style">
              <option value="solid">Solid</option>
              <option value="dashed">Dashed</option>
              <option value="dotted">Dotted</option>
              <option value="draw">Draw</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}

export function TldrawTextSection({
  color,
  mixed,
  placeholder,
  sizeNumber,
  onPickColor,
  onCommitHex,
  onChangeSizeNumber,
}: {
  color: string;
  mixed: boolean;
  placeholder: string;
  sizeNumber: number;
  onPickColor: (hex: string) => void;
  onCommitHex: (hex: string) => void;
  onChangeSizeNumber: (n: number) => void;
}) {
  return (
    <div className="nx-vsp-section">
      <div className="nx-vsp-title">Text</div>
      <div className="nx-vsp-group">
        <div className="nx-vsp-stack">
          <ColorPickerRow icon={<Type size={14} />} color={color} mixed={mixed} placeholder={placeholder} onPick={onPickColor} onCommitHex={onCommitHex} />
          <div className="nx-vsp-row">
            <div className="nx-vsp-icon">
              <Hash size={14} />
            </div>
            <input
              className="nx-vsp-number w-[96px]"
              type="number"
              min={1}
              max={4}
              step={1}
              value={sizeNumber}
              onChange={(e) => onChangeSizeNumber(Number(e.target.value || 2))}
              title="Text size (1-4)"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

