'use client';

export function NxTextTypographySection({
  text,
  fontSize,
  align,
  fontFamily,
  onChangeText,
  onChangeFontSize,
  onChangeAlign,
  onChangeFontFamily,
}: {
  text: string;
  fontSize: number;
  align: 'left' | 'center' | 'right';
  fontFamily: string;
  onChangeText: (next: string) => void;
  onChangeFontSize: (n: number) => void;
  onChangeAlign: (a: 'left' | 'center' | 'right') => void;
  onChangeFontFamily: (f: string) => void;
}) {
  return (
    <div className="nx-vsp-section">
      <div className="nx-vsp-title">Typography</div>
      <div className="nx-vsp-group">
        <div className="nx-vsp-stack">
          <div className="nx-vsp-row">
            <div className="nx-vsp-icon">T</div>
            <input className="nx-vsp-field flex-1" value={text} placeholder="Text…" onChange={(e) => onChangeText(String(e.target.value || ''))} />
          </div>
          <div className="nx-vsp-row">
            <div className="nx-vsp-icon">Aa</div>
            <input
              className="nx-vsp-number w-[96px]"
              type="number"
              min={6}
              max={256}
              value={Math.round(fontSize)}
              onChange={(e) => onChangeFontSize(Math.max(6, Math.min(256, Math.round(Number(e.target.value || fontSize)))) )}
              title="Font size"
            />
            <select className="nx-vsp-select w-[120px]" value={align} onChange={(e) => onChangeAlign(e.target.value as any)} title="Align">
              <option value="left">Left</option>
              <option value="center">Center</option>
              <option value="right">Right</option>
            </select>
          </div>

          <div className="nx-vsp-row">
            <div className="nx-vsp-icon">F</div>
            <select className="nx-vsp-select" value={fontFamily} onChange={(e) => onChangeFontFamily(e.target.value)} title="Font family">
              <option value="Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif">Inter</option>
              <option value="system-ui, -apple-system, Segoe UI, Roboto, sans-serif">System UI</option>
              <option value="ui-sans-serif, system-ui, sans-serif">Sans</option>
              <option value="ui-serif, Georgia, serif">Serif</option>
              <option value="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace">Mono</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}

