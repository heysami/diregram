'use client';

import { Plus, Trash2, ArrowUp, ArrowDown, Eye, EyeOff } from 'lucide-react';
import type { NxFxDropShadow, NxFxEffect, NxFxInnerShadow, NxFxStack } from '@/components/vision/tldraw/fx/nxfxTypes';

function clamp01(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function rgbaFromHex(hex: string, opacity: number): string {
  const h = String(hex || '#000000').replace('#', '').trim();
  const r = parseInt(h.slice(0, 2), 16) || 0;
  const g = parseInt(h.slice(2, 4), 16) || 0;
  const b = parseInt(h.slice(4, 6), 16) || 0;
  return `rgba(${r},${g},${b},${clamp01(opacity)})`;
}

function hexFromColorString(c: string): string {
  const s = String(c || '').trim();
  const m = s.match(/rgba?\(([^)]+)\)/i);
  if (m) {
    const parts = m[1].split(',').map((x) => Number(String(x).trim()));
    const r = Math.max(0, Math.min(255, Math.round(parts[0] ?? 0)));
    const g = Math.max(0, Math.min(255, Math.round(parts[1] ?? 0)));
    const b = Math.max(0, Math.min(255, Math.round(parts[2] ?? 0)));
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  }
  if (s.startsWith('#') && (s.length === 7 || s.length === 9)) return s.slice(0, 7);
  return '#000000';
}

export function NxFxEffectsSection({
  fx,
  onChangeFx,
  onAddDropShadow,
  onAddInnerShadow,
}: {
  fx: NxFxStack;
  onChangeFx: (next: NxFxStack) => void;
  onAddDropShadow: () => void;
  onAddInnerShadow: () => void;
}) {
  const effects = fx.effects || [];

  const move = (idx: number, dir: -1 | 1) => {
    const j = idx + dir;
    if (j < 0 || j >= effects.length) return;
    const next = [...effects];
    const tmp = next[idx];
    next[idx] = next[j];
    next[j] = tmp;
    onChangeFx({ ...fx, effects: next });
  };

  const toggleEnabled = (id: string) => {
    onChangeFx({
      ...fx,
      effects: effects.map((e) => (e.id === id ? { ...e, enabled: !e.enabled } : e)) as any,
    });
  };

  const remove = (id: string) => {
    onChangeFx({ ...fx, effects: effects.filter((e) => e.id !== id) });
  };

  const patch = (id: string, patcher: (prev: NxFxEffect) => NxFxEffect) => {
    onChangeFx({
      ...fx,
      effects: effects.map((e) => (e.id === id ? patcher(e) : e)) as any,
    });
  };

  const renderEffectControls = (e: NxFxEffect) => {
    const hex = hexFromColorString((e as any).color);
    const opacity = clamp01(Number((e as any).opacity ?? 1));
    return (
      <div className="nx-vsp-group">
        <div className="nx-vsp-row">
          <div className="nx-vsp-icon">C</div>
          <input
            type="color"
            value={hex}
            onChange={(ev) => {
              const nextHex = String(ev.target.value || hex);
              patch(e.id, (prev) => ({ ...(prev as any), color: rgbaFromHex(nextHex, opacity) } as any));
            }}
            className="h-8 w-10 border"
            title="Color"
          />
          <div className="nx-vsp-hint">Opacity</div>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={opacity}
            onChange={(ev) => patch(e.id, (prev) => ({ ...(prev as any), opacity: clamp01(Number(ev.target.value || 0)) } as any))}
            className="nx-vsp-range flex-1"
            title="Opacity"
          />
          <div className="nx-vsp-hint tabular-nums w-[40px] text-right">{Math.round(opacity * 100)}%</div>
        </div>

        <div className="nx-vsp-row">
          <div className="nx-vsp-icon">↔</div>
          <input
            className="nx-vsp-number w-[90px]"
            type="number"
            value={Number((e as any).offsetX ?? 0)}
            onChange={(ev) => patch(e.id, (prev) => ({ ...(prev as any), offsetX: Number(ev.target.value || 0) } as any))}
            title="Offset X"
          />
          <div className="nx-vsp-hint">X</div>
          <input
            className="nx-vsp-number w-[90px]"
            type="number"
            value={Number((e as any).offsetY ?? 0)}
            onChange={(ev) => patch(e.id, (prev) => ({ ...(prev as any), offsetY: Number(ev.target.value || 0) } as any))}
            title="Offset Y"
          />
          <div className="nx-vsp-hint">Y</div>
          <input
            className="nx-vsp-number w-[90px]"
            type="number"
            min={0}
            value={Math.max(0, Number((e as any).blur ?? 0))}
            onChange={(ev) => patch(e.id, (prev) => ({ ...(prev as any), blur: Math.max(0, Number(ev.target.value || 0)) } as any))}
            title="Blur"
          />
          <div className="nx-vsp-hint">Blur</div>
        </div>
      </div>
    );
  };

  return (
    <div className="nx-vsp-section">
      <div className="nx-vsp-title">Effects</div>
      <div className="nx-vsp-group">
        <div className="nx-vsp-row">
          <div className="nx-vsp-icon">
            <Plus size={14} />
          </div>
          <button type="button" className="nx-vsp-miniBtn flex-1" onClick={onAddDropShadow}>
            Add drop shadow
          </button>
          <button type="button" className="nx-vsp-miniBtn flex-1" onClick={onAddInnerShadow}>
            Add inner shadow
          </button>
        </div>
      </div>

      {effects.map((e, idx) => (
        <div key={e.id} className="nx-vsp-group">
          <div className="nx-vsp-row">
            <div className="nx-vsp-icon">{e.kind === 'dropShadow' ? 'DS' : 'IS'}</div>
            <button type="button" className="nx-vsp-miniBtn" onClick={() => toggleEnabled(e.id)} title={e.enabled ? 'Disable' : 'Enable'}>
              {e.enabled ? <Eye size={14} /> : <EyeOff size={14} />}
            </button>
            <div className="nx-vsp-hint flex-1">{e.kind === 'dropShadow' ? 'Drop shadow' : 'Inner shadow'}</div>
            <button type="button" className="nx-vsp-miniBtn" onClick={() => move(idx, -1)} title="Move up" disabled={idx === 0}>
              <ArrowUp size={14} />
            </button>
            <button
              type="button"
              className="nx-vsp-miniBtn"
              onClick={() => move(idx, 1)}
              title="Move down"
              disabled={idx === effects.length - 1}
            >
              <ArrowDown size={14} />
            </button>
            <button type="button" className="nx-vsp-miniBtn" onClick={() => remove(e.id)} title="Delete">
              <Trash2 size={14} />
            </button>
          </div>
          {renderEffectControls(e)}
        </div>
      ))}
    </div>
  );
}

export function makeDefaultDropShadow(id: string): NxFxDropShadow {
  return { id, kind: 'dropShadow', enabled: true, color: 'rgba(0,0,0,1)', offsetX: 8, offsetY: 10, blur: 16, opacity: 0.35 };
}

export function makeDefaultInnerShadow(id: string): NxFxInnerShadow {
  return { id, kind: 'innerShadow', enabled: true, color: 'rgba(0,0,0,1)', offsetX: 0, offsetY: 3, blur: 12, opacity: 0.25 };
}

