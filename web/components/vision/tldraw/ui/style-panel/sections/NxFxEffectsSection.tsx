'use client';

import { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, GripVertical, Plus, Trash2 } from 'lucide-react';
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
  const viewEffects = effects.slice().reverse();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const sel = effects.find((e) => e.id === selectedId) || effects[0] || null;
  const draggingRef = useRef<number | null>(null);
  const lastEnterIdxRef = useRef<number | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (selectedId && effects.some((e) => e.id === selectedId)) return;
    setSelectedId(effects[0]?.id || null);
  }, [effects, selectedId]);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      const el = menuRef.current;
      if (!el) return;
      if (el.contains(e.target as any)) return;
      setMenuOpen(false);
    };
    window.addEventListener('mousedown', onDown, { passive: true });
    return () => window.removeEventListener('mousedown', onDown);
  }, [menuOpen]);

  const move = (from: number, to: number) => {
    if (from === to) return;
    if (from < 0 || to < 0 || from >= effects.length || to >= effects.length) return;
    const next = effects.slice();
    const [it] = next.splice(from, 1);
    next.splice(to, 0, it);
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
      <div className="nx-vsp-sectionHeader">
        <div className="nx-vsp-title">Effects</div>
        <div className="nx-vsp-addWrap" ref={menuRef}>
          <button type="button" className="nx-vsp-iconBtn" onClick={() => setMenuOpen((v) => !v)} title="Add effect">
            <Plus size={14} />
          </button>
          {menuOpen ? (
            <div className="nx-vsp-menu">
              <button
                type="button"
                className="nx-vsp-menuItem"
                onClick={() => {
                  onAddDropShadow();
                  setMenuOpen(false);
                }}
              >
                <span className="nx-vsp-layerType">Drop shadow</span>
              </button>
              <button
                type="button"
                className="nx-vsp-menuItem"
                onClick={() => {
                  onAddInnerShadow();
                  setMenuOpen(false);
                }}
              >
                <span className="nx-vsp-layerType">Inner shadow</span>
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <div className="nx-vsp-group">
        <div className="nx-vsp-layerList">
          {viewEffects.map((e, viewIdx) => {
            const idx = effects.length - 1 - viewIdx;
            const enabled = e.enabled !== false;
            const isSel = sel ? sel.id === e.id : false;
            const label = e.kind === 'dropShadow' ? 'Drop shadow' : 'Inner shadow';
            return (
              <div
                key={e.id}
                className={isSel ? 'nx-vsp-layerItem is-selected' : 'nx-vsp-layerItem'}
                onClick={() => setSelectedId(e.id)}
                onDragEnter={() => {
                  const from = draggingRef.current;
                  if (from === null) return;
                  if (lastEnterIdxRef.current === idx) return;
                  lastEnterIdxRef.current = idx;
                  const to = idx;
                  if (from === to) return;
                  move(from, to);
                  draggingRef.current = to;
                }}
                onDragOver={(ev) => {
                  ev.preventDefault();
                  const from = draggingRef.current;
                  if (from === null) return;
                  const to = idx;
                  if (from === to) return;
                  move(from, to);
                  draggingRef.current = to;
                }}
                onDrop={() => {}}
              >
                <span
                  className="nx-vsp-dragHandle"
                  draggable
                  onDragStart={(ev) => {
                    draggingRef.current = idx;
                    try {
                      ev.dataTransfer.effectAllowed = 'move';
                      ev.dataTransfer.setData('text/plain', String(idx));
                    } catch {
                      // ignore
                    }
                  }}
                  onDragEnd={() => {
                    draggingRef.current = null;
                  }}
                  title="Drag to reorder"
                >
                  <GripVertical size={16} />
                </span>
                <span className="nx-vsp-layerType">{label}</span>
                <span className="nx-vsp-layerSpacer" />
                <button
                  type="button"
                  className="nx-vsp-iconBtn"
                  onClick={(ev) => {
                    ev.stopPropagation();
                    toggleEnabled(e.id);
                  }}
                  title={enabled ? 'Hide' : 'Show'}
                >
                  {enabled ? <Eye size={14} /> : <EyeOff size={14} />}
                </button>
                <button
                  type="button"
                  className="nx-vsp-iconBtn"
                  onClick={(ev) => {
                    ev.stopPropagation();
                    remove(e.id);
                  }}
                  title="Delete"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {sel ? renderEffectControls(sel) : null}
    </div>
  );
}

export function makeDefaultDropShadow(id: string): NxFxDropShadow {
  return { id, kind: 'dropShadow', enabled: true, color: 'rgba(0,0,0,1)', offsetX: 8, offsetY: 10, blur: 16, opacity: 0.35 };
}

export function makeDefaultInnerShadow(id: string): NxFxInnerShadow {
  return { id, kind: 'innerShadow', enabled: true, color: 'rgba(0,0,0,1)', offsetX: 0, offsetY: 3, blur: 12, opacity: 0.25 };
}

