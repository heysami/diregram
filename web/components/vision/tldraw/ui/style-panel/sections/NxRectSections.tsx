'use client';

import { useMemo, useState } from 'react';
import { Droplets, Hash, Radius } from 'lucide-react';
import { ColorPickerRow, GradientStopsEditor, StopSwatch } from '@/components/vision/tldraw/ui/style-panel/ui-primitives';
import { parseStopsJson, serializeStops } from '@/components/vision/tldraw/lib/gradient-stops';
import { toHexOrEmpty } from '@/components/vision/tldraw/ui/style-panel/color-utils';

type PaintMode = 'solid' | 'linear' | 'radial' | 'pattern';
type PatternKind = 'stripes' | 'dots' | 'checker';

function clamp(v: number, lo: number, hi: number) {
  if (!Number.isFinite(v)) return lo;
  return Math.max(lo, Math.min(hi, v));
}

function Overlay({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: any;
}) {
  return (
    <div className="nx-vsp-overlay">
      <div className="nx-vsp-overlayBackdrop" onClick={onClose} />
      <div className="nx-vsp-overlayPanel">
        <div className="nx-vsp-overlayHeader">
          <div className="nx-vsp-overlayTitle">{title}</div>
          <button type="button" className="nx-vsp-overlayClose" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="nx-vsp-overlayBody">{children}</div>
      </div>
    </div>
  );
}

export function NxRectCornersSection({
  radiusUniform,
  radius,
  rtl,
  rtr,
  rbr,
  rbl,
  onSetUniformRadius,
  onSetCorners,
  embedded,
}: {
  radiusUniform: boolean;
  radius: number;
  rtl: number;
  rtr: number;
  rbr: number;
  rbl: number;
  onSetUniformRadius: (r: number) => void;
  onSetCorners: (next: { rtl: number; rtr: number; rbr: number; rbl: number; uniform: boolean }) => void;
  /** Render without outer section wrapper/title (for grouping under another header). */
  embedded?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const corners = useMemo(() => ({ rtl, rtr, rbr, rbl }), [rtl, rtr, rbr, rbl]);

  const body = (
    <>
      <div className="nx-vsp-group">
        <div className="nx-vsp-stack">
          <div className="nx-vsp-row">
            <div className="nx-vsp-icon">
              <Radius size={14} />
            </div>
            <input
              className="nx-vsp-number w-[96px]"
              type="number"
              min={0}
              max={200}
              value={Math.round(radius)}
              onChange={(e) => onSetUniformRadius(clamp(Number(e.target.value || 0), 0, 200))}
              title="Corner radius"
            />
            <button type="button" className="nx-vsp-miniBtn" onClick={() => setOpen(true)} title="Edit per-corner radii">
              Corners…
            </button>
            <div className="nx-vsp-hint flex-1">{radiusUniform ? 'Uniform' : 'Per-corner'}</div>
          </div>
        </div>
      </div>

      {open ? (
        <Overlay title="Corner radii" onClose={() => setOpen(false)}>
          <div className="nx-vsp-stack">
            <label className="nx-vsp-overlayLabel">
              <input
                type="checkbox"
                checked={radiusUniform}
                onChange={(e) => {
                  const uniform = !!e.target.checked;
                  if (uniform) onSetCorners({ ...corners, uniform: true });
                  else onSetCorners({ ...corners, uniform: false });
                }}
              />{' '}
              Link corners (uniform)
            </label>

            <div className="nx-vsp-overlayGrid">
              {(['TL', 'TR', 'BR', 'BL'] as const).map((k) => {
                const key = k.toLowerCase() as 'tl' | 'tr' | 'br' | 'bl';
                const val = key === 'tl' ? rtl : key === 'tr' ? rtr : key === 'br' ? rbr : rbl;
                return (
                  <div key={k} className="nx-vsp-overlayCell">
                    <div className="nx-vsp-overlayCellLabel">{k}</div>
                    <input
                      className="nx-vsp-number"
                      type="number"
                      min={0}
                      max={200}
                      value={Math.round(val)}
                      onChange={(e) => {
                        const v = clamp(Number(e.target.value || 0), 0, 200);
                        const next = { rtl, rtr, rbr, rbl };
                        if (key === 'tl') next.rtl = v;
                        if (key === 'tr') next.rtr = v;
                        if (key === 'br') next.rbr = v;
                        if (key === 'bl') next.rbl = v;
                        if (radiusUniform) onSetCorners({ rtl: v, rtr: v, rbr: v, rbl: v, uniform: true });
                        else onSetCorners({ ...next, uniform: false });
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </Overlay>
      ) : null}
    </>
  );

  if (embedded) return body;
  return (
    <div className="nx-vsp-section">
      <div className="nx-vsp-title">Roundness</div>
      {body}
    </div>
  );
}

export function NxRectStrokeSidesSection({
  uniform,
  width,
  top,
  right,
  bottom,
  left,
  onSetUniform,
  onSetAll,
  onSetSides,
}: {
  uniform: boolean;
  width: number;
  top: number;
  right: number;
  bottom: number;
  left: number;
  onSetUniform: (v: boolean) => void;
  onSetAll: (w: number) => void;
  onSetSides: (next: { top: number; right: number; bottom: number; left: number }) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="nx-vsp-section">
      <div className="nx-vsp-title">Outline width</div>
      <div className="nx-vsp-group">
        <div className="nx-vsp-stack">
          <div className="nx-vsp-row">
            <div className="nx-vsp-icon">
              <Hash size={14} />
            </div>
            <input
              className="nx-vsp-number w-[96px]"
              type="number"
              min={0}
              max={128}
              value={Math.round(width)}
              onChange={(e) => onSetAll(clamp(Number(e.target.value || 0), 0, 128))}
              title="Stroke width"
            />
            <label className="nx-vsp-hint flex items-center gap-2">
              <input type="checkbox" checked={uniform} onChange={(e) => onSetUniform(!!e.target.checked)} /> Uniform
            </label>
            <button type="button" className="nx-vsp-miniBtn" onClick={() => setOpen(true)} disabled={uniform} title="Edit per-side stroke widths">
              Sides…
            </button>
          </div>
        </div>
      </div>

      {open && !uniform ? (
        <Overlay title="Outline sides" onClose={() => setOpen(false)}>
          <div className="nx-vsp-overlayGrid">
            {(
              [
                ['Top', top, 'top'],
                ['Right', right, 'right'],
                ['Bottom', bottom, 'bottom'],
                ['Left', left, 'left'],
              ] as const
            ).map(([label, val, key]) => (
              <div key={key} className="nx-vsp-overlayCell">
                <div className="nx-vsp-overlayCellLabel">{label}</div>
                <input
                  className="nx-vsp-number"
                  type="number"
                  min={0}
                  max={128}
                  value={Math.round(val)}
                  onChange={(e) => {
                    const v = clamp(Number(e.target.value || 0), 0, 128);
                    const next = { top, right, bottom, left };
                    (next as any)[key] = v;
                    onSetSides(next);
                  }}
                />
              </div>
            ))}
          </div>
        </Overlay>
      ) : null}
    </div>
  );
}

export function NxRectPaintSection({
  title,
  icon,
  mode,
  solid,
  a,
  b,
  angle,
  pattern,
  stopsJson,
  showAngle,
  onChangeMode,
  onChangeSolid,
  onChangeA,
  onChangeB,
  onChangeAngle,
  onChangePattern,
  onChangeStopsJson,
  onActivateGradientHandles,
}: {
  title: string;
  icon: any;
  mode: PaintMode;
  solid: string;
  a: string;
  b: string;
  angle: number;
  pattern: PatternKind;
  stopsJson?: string;
  showAngle?: boolean;
  onChangeMode: (m: PaintMode) => void;
  onChangeSolid: (hex: string) => void;
  onChangeA: (hex: string) => void;
  onChangeB: (hex: string) => void;
  onChangeAngle: (deg: number) => void;
  onChangePattern: (p: PatternKind) => void;
  onChangeStopsJson: (json: string) => void;
  onActivateGradientHandles?: () => void;
}) {
  const canShowAngle = showAngle !== false;
  return (
    <div className="nx-vsp-section">
      <div className="nx-vsp-title">{title}</div>
      <div className="nx-vsp-group">
        <div className="nx-vsp-stack">
          <div className="nx-vsp-row">
            <div className="nx-vsp-icon">{icon}</div>
            <select className="nx-vsp-select flex-1" value={mode} onChange={(e) => onChangeMode(e.target.value as any)} title="Paint mode">
              <option value="solid">Solid</option>
              <option value="linear">Linear</option>
              <option value="radial">Radial</option>
              <option value="pattern">Pattern</option>
            </select>
            {mode === 'linear' && !canShowAngle ? (
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
            {mode === 'linear' && canShowAngle ? (
              <input
                className="nx-vsp-number w-[84px]"
                type="number"
                min={0}
                max={360}
                value={Math.round(angle)}
                onChange={(e) => onChangeAngle(clamp(Number(e.target.value || 0), 0, 360))}
                title="Angle"
              />
            ) : null}
            {mode === 'pattern' ? (
              <select className="nx-vsp-select w-[120px]" value={pattern} onChange={(e) => onChangePattern(e.target.value as any)} title="Pattern">
                <option value="stripes">Stripes</option>
                <option value="dots">Dots</option>
                <option value="checker">Checker</option>
              </select>
            ) : null}
          </div>

          {mode === 'solid' ? (
            <ColorPickerRow
              icon={<Droplets size={14} />}
              color={solid}
              onPick={(hex) => onChangeSolid(toHexOrEmpty(hex) || solid)}
              onCommitHex={(hex) => onChangeSolid(hex)}
            />
          ) : mode === 'pattern' ? (
            <div className="nx-vsp-row">
              <div className="nx-vsp-icon">
                <Droplets size={14} />
              </div>
              <StopSwatch color={a} title="A" onPick={(hex) => onChangeA(toHexOrEmpty(hex) || a)} />
              <StopSwatch color={b} title="B" onPick={(hex) => onChangeB(toHexOrEmpty(hex) || b)} />
              <div
                className="nx-vsp-preview flex-1"
                style={{
                  // NOTE: this branch only renders when `mode === 'pattern'`.
                  backgroundImage: `linear-gradient(45deg, ${a} 0 25%, ${b} 25% 50%, ${a} 50% 75%, ${b} 75% 100%)`,
                }}
                title="Preview"
              >
                <span className="nx-vsp-previewLabel">
                  {a} → {b}
                </span>
              </div>
            </div>
          ) : (
            <div onPointerDown={() => onActivateGradientHandles?.()} onFocus={() => onActivateGradientHandles?.()}>
              <GradientStopsEditor
                stops={parseStopsJson(stopsJson, a, b)}
                onChangeStops={(next) => onChangeStopsJson(serializeStops(next))}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

