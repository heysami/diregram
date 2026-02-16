'use client';

import { ColorPickerRow } from '@/components/vision/tldraw/ui/style-panel/ui-primitives';
import { toHexOrEmpty } from '@/components/vision/tldraw/ui/style-panel/color-utils';

export function NxRectLabelSection({
  label,
  labelSize,
  labelAlign,
  labelColor,
  onChangeLabel,
  onChangeLabelSize,
  onChangeLabelAlign,
  onChangeLabelColor,
}: {
  label: string;
  labelSize: number;
  labelAlign: 'left' | 'center' | 'right';
  labelColor: string;
  onChangeLabel: (s: string) => void;
  onChangeLabelSize: (n: number) => void;
  onChangeLabelAlign: (a: 'left' | 'center' | 'right') => void;
  onChangeLabelColor: (hex: string) => void;
}) {
  return (
    <div className="nx-vsp-section">
      <div className="nx-vsp-title">Label</div>
      <div className="nx-vsp-group">
        <div className="nx-vsp-stack">
          <div className="nx-vsp-row">
            <div className="nx-vsp-icon">T</div>
            <input className="nx-vsp-field flex-1" value={label} placeholder="Label…" onChange={(e) => onChangeLabel(String(e.target.value || ''))} />
          </div>
          <div className="nx-vsp-row">
            <div className="nx-vsp-icon">Aa</div>
            <input
              className="nx-vsp-number w-[96px]"
              type="number"
              min={6}
              max={256}
              value={Math.round(labelSize)}
              onChange={(e) => onChangeLabelSize(Math.max(6, Math.min(256, Math.round(Number(e.target.value || labelSize)))))}
              title="Label size"
            />
            <select className="nx-vsp-select w-[120px]" value={labelAlign} onChange={(e) => onChangeLabelAlign(e.target.value as any)} title="Label align">
              <option value="left">Left</option>
              <option value="center">Center</option>
              <option value="right">Right</option>
            </select>
          </div>
          <ColorPickerRow
            icon={<span />}
            color={labelColor}
            onPick={(hex) => onChangeLabelColor(toHexOrEmpty(hex) || labelColor)}
            onCommitHex={(hex) => onChangeLabelColor(hex)}
          />
        </div>
      </div>
    </div>
  );
}

