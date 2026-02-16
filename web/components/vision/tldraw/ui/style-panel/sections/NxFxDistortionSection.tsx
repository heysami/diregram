'use client';

import { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, GripVertical, Plus, Trash2 } from 'lucide-react';
import type { NxFxDistortion, NxFxRamp, NxFxRampStop, NxFxStack } from '@/components/vision/tldraw/fx/nxfxTypes';
import { makeDefaultRamp } from '@/components/vision/tldraw/fx/nxfxTypes';

function clamp01(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function clamp(n: number, lo: number, hi: number) {
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, n));
}

function normalizeRampStops(stops: NxFxRampStop[]): NxFxRampStop[] {
  const s = (Array.isArray(stops) ? stops : [])
    .map((x) => ({ t: clamp01(Number(x.t)), v: clamp01(Number(x.v)) }))
    .sort((a, b) => a.t - b.t);
  if (s.length >= 2) return s;
  return makeDefaultRamp().stops;
}

function RampEditor({
  ramp,
  onChange,
}: {
  ramp: NxFxRamp;
  onChange: (next: NxFxRamp) => void;
}) {
  const stops = normalizeRampStops(ramp.stops || []);
  return (
    <div className="nx-vsp-group">
      <div className="nx-vsp-row">
        <div className="nx-vsp-icon">∠</div>
        <div className="nx-vsp-hint">Angle</div>
        <input
          className="nx-vsp-number w-[90px]"
          type="number"
          min={0}
          max={360}
          value={Number(ramp.angleDeg || 0)}
          onChange={(e) => onChange({ ...ramp, angleDeg: clamp(Number(e.target.value || 0), 0, 360) })}
          title="Ramp angle"
        />
        <div className="nx-vsp-hint">deg</div>
      </div>

      {stops.map((s, idx) => (
        <div key={`${idx}-${s.t}`} className="nx-vsp-row">
          <div className="nx-vsp-icon">{idx + 1}</div>
          <div className="nx-vsp-hint">T</div>
          <input
            className="nx-vsp-number w-[90px]"
            type="number"
            min={0}
            max={100}
            value={Math.round(s.t * 100)}
            onChange={(e) => {
              const t = clamp01(Number(e.target.value || 0) / 100);
              const next = stops.map((x, i) => (i === idx ? { ...x, t } : x));
              onChange({ ...ramp, stops: normalizeRampStops(next) });
            }}
            title="Position (%)"
          />
          <div className="nx-vsp-hint">V</div>
          <input
            className="nx-vsp-number w-[90px]"
            type="number"
            min={0}
            max={100}
            value={Math.round(s.v * 100)}
            onChange={(e) => {
              const v = clamp01(Number(e.target.value || 0) / 100);
              const next = stops.map((x, i) => (i === idx ? { ...x, v } : x));
              onChange({ ...ramp, stops: normalizeRampStops(next) });
            }}
            title="Strength (%)"
          />
          <div className="nx-vsp-hint">%</div>
          <button
            type="button"
            className="nx-vsp-miniBtn"
            onClick={() => {
              if (stops.length <= 2) return;
              const next = stops.filter((_, i) => i !== idx);
              onChange({ ...ramp, stops: normalizeRampStops(next) });
            }}
            disabled={stops.length <= 2}
            title="Remove stop"
          >
            <Trash2 size={14} />
          </button>
        </div>
      ))}

      <div className="nx-vsp-row">
        <div className="nx-vsp-icon">
          <Plus size={14} />
        </div>
        <button
          type="button"
          className="nx-vsp-miniBtn flex-1"
          onClick={() => {
            const last = stops[stops.length - 1] || { t: 1, v: 1 };
            const next = [...stops, { t: clamp01(last.t - 0.15), v: last.v }];
            onChange({ ...ramp, stops: normalizeRampStops(next) });
          }}
        >
          Add ramp stop
        </button>
      </div>
    </div>
  );
}

export function NxFxDistortionSection({
  fx,
  onChangeFx,
  onAdd,
}: {
  fx: NxFxStack;
  onChangeFx: (next: NxFxStack) => void;
  onAdd: (kind: NxFxDistortion['kind']) => void;
}) {
  const ds = fx.distortions || [];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const sel = ds.find((d) => d.id === selectedId) || ds[0] || null;
  const draggingRef = useRef<number | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (selectedId && ds.some((d) => d.id === selectedId)) return;
    setSelectedId(ds[0]?.id || null);
  }, [ds, selectedId]);

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
    if (from < 0 || to < 0 || from >= ds.length || to >= ds.length) return;
    const next = ds.slice();
    const [it] = next.splice(from, 1);
    next.splice(to, 0, it);
    onChangeFx({ ...fx, distortions: next });
  };

  const toggleEnabled = (id: string) => {
    onChangeFx({
      ...fx,
      distortions: ds.map((d) => (d.id === id ? { ...d, enabled: !d.enabled } : d)) as any,
    });
  };

  const remove = (id: string) => {
    onChangeFx({ ...fx, distortions: ds.filter((d) => d.id !== id) });
  };

  const patch = (id: string, patcher: (prev: NxFxDistortion) => NxFxDistortion) => {
    onChangeFx({
      ...fx,
      distortions: ds.map((d) => (d.id === id ? patcher(d) : d)) as any,
    });
  };

  const renderControls = (d: NxFxDistortion) => {
    if (d.kind === 'blur') {
      return (
        <div className="nx-vsp-group">
          <div className="nx-vsp-row">
            <div className="nx-vsp-icon">R</div>
            <div className="nx-vsp-hint">Radius</div>
            <input
              className="nx-vsp-number w-[120px]"
              type="number"
              min={0}
              value={Math.max(0, Number(d.radius || 0))}
              onChange={(e) => patch(d.id, (prev) => ({ ...(prev as any), radius: Math.max(0, Number(e.target.value || 0)) }))}
              title="Blur radius (px)"
            />
            <div className="nx-vsp-hint">px</div>
          </div>
          <div className="nx-vsp-row">
            <div className="nx-vsp-icon">∇</div>
            <button
              type="button"
              className="nx-vsp-miniBtn flex-1"
              onClick={() =>
                patch(d.id, (prev) => ({
                  ...(prev as any),
                  ramp: (prev as any).ramp ? undefined : makeDefaultRamp(),
                }))
              }
            >
              {(d as any).ramp ? 'Remove strength ramp' : 'Add strength ramp'}
            </button>
          </div>
          {(d as any).ramp ? (
            <RampEditor
              ramp={(d as any).ramp as NxFxRamp}
              onChange={(r) => patch(d.id, (prev) => ({ ...(prev as any), ramp: r }))}
            />
          ) : null}
        </div>
      );
    }

    if (d.kind === 'motionBlur') {
      return (
        <div className="nx-vsp-group">
          <div className="nx-vsp-row">
            <div className="nx-vsp-icon">∠</div>
            <div className="nx-vsp-hint">Angle</div>
            <input
              className="nx-vsp-number w-[90px]"
              type="number"
              min={0}
              max={360}
              value={Number(d.angleDeg || 0)}
              onChange={(e) => patch(d.id, (prev) => ({ ...(prev as any), angleDeg: clamp(Number(e.target.value || 0), 0, 360) }))}
            />
            <div className="nx-vsp-hint">deg</div>
            <div className="nx-vsp-hint">Dist</div>
            <input
              className="nx-vsp-number w-[90px]"
              type="number"
              min={0}
              value={Math.max(0, Number(d.distance || 0))}
              onChange={(e) => patch(d.id, (prev) => ({ ...(prev as any), distance: Math.max(0, Number(e.target.value || 0)) }))}
            />
            <div className="nx-vsp-hint">px</div>
          </div>
          <div className="nx-vsp-row">
            <div className="nx-vsp-icon">S</div>
            <div className="nx-vsp-hint">Samples</div>
            <input
              className="nx-vsp-number w-[90px]"
              type="number"
              min={2}
              max={64}
              value={Math.max(2, Number(d.samples || 8))}
              onChange={(e) =>
                patch(d.id, (prev) => ({ ...(prev as any), samples: Math.max(2, Math.min(64, Math.round(Number(e.target.value || 2)))) }))
              }
            />
          </div>
        </div>
      );
    }

    if (d.kind === 'bloom') {
      return (
        <div className="nx-vsp-group">
          <div className="nx-vsp-row">
            <div className="nx-vsp-icon">T</div>
            <div className="nx-vsp-hint">Threshold</div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={clamp01(Number(d.threshold ?? 0.75))}
              onChange={(e) => patch(d.id, (prev) => ({ ...(prev as any), threshold: clamp01(Number(e.target.value || 0)) }))}
              className="nx-vsp-range flex-1"
            />
            <div className="nx-vsp-hint tabular-nums w-[40px] text-right">{Math.round(clamp01(Number(d.threshold ?? 0.75)) * 100)}%</div>
          </div>
          <div className="nx-vsp-row">
            <div className="nx-vsp-icon">R</div>
            <div className="nx-vsp-hint">Radius</div>
            <input
              className="nx-vsp-number w-[90px]"
              type="number"
              min={0}
              value={Math.max(0, Number(d.radius || 0))}
              onChange={(e) => patch(d.id, (prev) => ({ ...(prev as any), radius: Math.max(0, Number(e.target.value || 0)) }))}
            />
            <div className="nx-vsp-hint">px</div>
            <div className="nx-vsp-hint">Int</div>
            <input
              className="nx-vsp-number w-[90px]"
              type="number"
              min={0}
              max={5}
              step={0.1}
              value={clamp(Number(d.intensity ?? 1.2), 0, 5)}
              onChange={(e) => patch(d.id, (prev) => ({ ...(prev as any), intensity: clamp(Number(e.target.value || 0), 0, 5) }))}
            />
          </div>
        </div>
      );
    }

    if (d.kind === 'glitch') {
      return (
        <div className="nx-vsp-group">
          <div className="nx-vsp-row">
            <div className="nx-vsp-icon">S</div>
            <div className="nx-vsp-hint">Strength</div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={clamp01(Number(d.strength ?? 0.35))}
              onChange={(e) => patch(d.id, (prev) => ({ ...(prev as any), strength: clamp01(Number(e.target.value || 0)) }))}
              className="nx-vsp-range flex-1"
            />
            <div className="nx-vsp-hint tabular-nums w-[40px] text-right">{Math.round(clamp01(Number(d.strength ?? 0.35)) * 100)}%</div>
          </div>
          <div className="nx-vsp-row">
            <div className="nx-vsp-icon">RGB</div>
            <div className="nx-vsp-hint">Offset</div>
            <input
              className="nx-vsp-number w-[90px]"
              type="number"
              min={0}
              value={Math.max(0, Number(d.rgbOffset || 0))}
              onChange={(e) => patch(d.id, (prev) => ({ ...(prev as any), rgbOffset: Math.max(0, Number(e.target.value || 0)) }))}
            />
            <div className="nx-vsp-hint">px</div>
            <div className="nx-vsp-hint">Lines</div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={clamp01(Number(d.scanlines ?? 0.25))}
              onChange={(e) => patch(d.id, (prev) => ({ ...(prev as any), scanlines: clamp01(Number(e.target.value || 0)) }))}
              className="nx-vsp-range flex-1"
            />
          </div>
        </div>
      );
    }

    if (d.kind === 'mosh') {
      return (
        <div className="nx-vsp-group">
          <div className="nx-vsp-row">
            <div className="nx-vsp-icon">S</div>
            <div className="nx-vsp-hint">Strength</div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={clamp01(Number(d.strength ?? 0.35))}
              onChange={(e) => patch(d.id, (prev) => ({ ...(prev as any), strength: clamp01(Number(e.target.value || 0)) }))}
              className="nx-vsp-range flex-1"
            />
            <div className="nx-vsp-hint tabular-nums w-[40px] text-right">{Math.round(clamp01(Number(d.strength ?? 0.35)) * 100)}%</div>
          </div>
          <div className="nx-vsp-row">
            <div className="nx-vsp-icon">B</div>
            <div className="nx-vsp-hint">Block</div>
            <input
              className="nx-vsp-number w-[90px]"
              type="number"
              min={1}
              value={Math.max(1, Number(d.blockSize || 16))}
              onChange={(e) => patch(d.id, (prev) => ({ ...(prev as any), blockSize: Math.max(1, Number(e.target.value || 1)) }))}
            />
            <div className="nx-vsp-hint">px</div>
          </div>
          <div className="nx-vsp-row">
            <div className="nx-vsp-icon">∇</div>
            <button
              type="button"
              className="nx-vsp-miniBtn flex-1"
              onClick={() =>
                patch(d.id, (prev) => ({
                  ...(prev as any),
                  ramp: (prev as any).ramp ? undefined : makeDefaultRamp(),
                }))
              }
            >
              {(d as any).ramp ? 'Remove strength ramp' : 'Add strength ramp'}
            </button>
          </div>
          {(d as any).ramp ? (
            <RampEditor
              ramp={(d as any).ramp as NxFxRamp}
              onChange={(r) => patch(d.id, (prev) => ({ ...(prev as any), ramp: r }))}
            />
          ) : null}
        </div>
      );
    }

    if (d.kind === 'grain') {
      return (
        <div className="nx-vsp-group">
          <div className="nx-vsp-row">
            <div className="nx-vsp-icon">S</div>
            <div className="nx-vsp-hint">Strength</div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={clamp01(Number(d.strength ?? 0.22))}
              onChange={(e) => patch(d.id, (prev) => ({ ...(prev as any), strength: clamp01(Number(e.target.value || 0)) }))}
              className="nx-vsp-range flex-1"
            />
            <div className="nx-vsp-hint tabular-nums w-[40px] text-right">{Math.round(clamp01(Number(d.strength ?? 0.22)) * 100)}%</div>
          </div>
          <div className="nx-vsp-row">
            <div className="nx-vsp-icon">Sz</div>
            <div className="nx-vsp-hint">Size</div>
            <input
              className="nx-vsp-number w-[90px]"
              type="number"
              min={0.5}
              step={0.1}
              value={Math.max(0.5, Number(d.size ?? 1.2))}
              onChange={(e) => patch(d.id, (prev) => ({ ...(prev as any), size: Math.max(0.5, Number(e.target.value || 0.5)) }))}
            />
            <div className="nx-vsp-hint">px</div>
          </div>
        </div>
      );
    }

    if (d.kind === 'doodle') {
      return (
        <div className="nx-vsp-group">
          <div className="nx-vsp-row">
            <div className="nx-vsp-icon">S</div>
            <div className="nx-vsp-hint">Strength</div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={clamp01(Number(d.strength ?? 0.45))}
              onChange={(e) => patch(d.id, (prev) => ({ ...(prev as any), strength: clamp01(Number(e.target.value || 0)) }))}
              className="nx-vsp-range flex-1"
            />
            <div className="nx-vsp-hint tabular-nums w-[40px] text-right">{Math.round(clamp01(Number(d.strength ?? 0.45)) * 100)}%</div>
          </div>
          <div className="nx-vsp-row">
            <div className="nx-vsp-icon">Sc</div>
            <div className="nx-vsp-hint">Scale</div>
            <input
              className="nx-vsp-number w-[90px]"
              type="number"
              min={0.5}
              step={0.5}
              value={Math.max(0.5, Number(d.scale ?? 6))}
              onChange={(e) => patch(d.id, (prev) => ({ ...(prev as any), scale: Math.max(0.5, Number(e.target.value || 0.5)) }))}
            />
            <div className="nx-vsp-hint">px</div>
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <div className="nx-vsp-section">
      <div className="nx-vsp-sectionHeader">
        <div className="nx-vsp-title">Distortion</div>
        <div className="nx-vsp-addWrap" ref={menuRef}>
          <button type="button" className="nx-vsp-iconBtn" onClick={() => setMenuOpen((v) => !v)} title="Add distortion">
            <Plus size={14} />
          </button>
          {menuOpen ? (
            <div className="nx-vsp-menu">
              {(
                [
                  ['blur', 'Blur'],
                  ['motionBlur', 'Motion blur'],
                  ['bloom', 'Bloom'],
                  ['glitch', 'Glitch'],
                  ['mosh', 'Mosh'],
                  ['grain', 'Grain'],
                  ['doodle', 'Doodle'],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  className="nx-vsp-menuItem"
                  onClick={() => {
                    onAdd(k as any);
                    setMenuOpen(false);
                  }}
                >
                  <span className="nx-vsp-layerType">{label}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <div className="nx-vsp-group">
        <div className="nx-vsp-layerList">
          {ds.map((d, idx) => {
            const enabled = d.enabled !== false;
            const isSel = sel ? sel.id === d.id : false;
            return (
              <div
                key={d.id}
                className={isSel ? 'nx-vsp-layerItem is-selected' : 'nx-vsp-layerItem'}
                onClick={() => setSelectedId(d.id)}
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
                <span className="nx-vsp-layerType">{String(d.kind || '')}</span>
                <span className="nx-vsp-layerSpacer" />
                <button
                  type="button"
                  className="nx-vsp-iconBtn"
                  onClick={(ev) => {
                    ev.stopPropagation();
                    toggleEnabled(d.id);
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
                    remove(d.id);
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

      {sel ? renderControls(sel) : null}
    </div>
  );
}

