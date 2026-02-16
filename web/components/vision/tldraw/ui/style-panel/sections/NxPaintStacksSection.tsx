'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownToLine, ArrowLeftRight, ArrowUpToLine, Eye, EyeOff, GripVertical, Layers, Plus, Trash2 } from 'lucide-react';
import { ColorPickerRow, GradientStopsEditor } from '@/components/vision/tldraw/ui/style-panel/ui-primitives';
import {
  makeDefaultFillLayer,
  makeDefaultStrokeLayer,
  parseFillLayers,
  parseStopsJsonLoose,
  parseStrokeLayers,
  serializeFillLayers,
  serializeStopsJson,
  serializeStrokeLayers,
  type NxDash,
  type NxFillLayer,
  type NxStrokeLayer,
} from '@/components/vision/tldraw/paint/nxPaintLayers';

function clamp(v: number, lo: number, hi: number) {
  if (!Number.isFinite(v)) return lo;
  return Math.max(lo, Math.min(hi, v));
}

function reorder<T>(arr: T[], from: number, to: number) {
  const next = arr.slice();
  const [it] = next.splice(from, 1);
  next.splice(to, 0, it);
  return next;
}

function dashKindOptions() {
  return [
    { id: 'solid', label: 'Solid' },
    { id: 'dashed', label: 'Dashed' },
    { id: 'dotted', label: 'Dotted' },
    { id: 'custom', label: 'Custom' },
  ] as const;
}

function useOutsideClick(ref: any, onOutside: () => void, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const onDown = (e: MouseEvent) => {
      const el = ref?.current as HTMLElement | null;
      if (!el) return;
      if (el.contains(e.target as any)) return;
      onOutside();
    };
    window.addEventListener('mousedown', onDown, { passive: true });
    return () => window.removeEventListener('mousedown', onDown);
  }, [ref, onOutside, enabled]);
}

function typeLabel(mode: string) {
  const m = String(mode || 'solid');
  if (m === 'linear') return 'Linear';
  if (m === 'radial') return 'Radial';
  if (m === 'pattern') return 'Pattern';
  return 'Solid';
}

function IconGroup({
  value,
  options,
  onChange,
}: {
  value: string;
  options: { id: string; title: string; icon: any }[];
  onChange: (id: string) => void;
}) {
  return (
    <div className="nx-vsp-btnGroup" role="group">
      {options.map((o) => {
        const Icon = o.icon;
        return (
          <button
            key={o.id}
            type="button"
            className={value === o.id ? 'nx-vsp-btnGroupBtn is-active' : 'nx-vsp-btnGroupBtn'}
            onClick={() => onChange(o.id)}
            title={o.title}
            aria-label={o.title}
          >
            <Icon size={16} />
          </button>
        );
      })}
    </div>
  );
}

export function NxFillStackSection({
  title,
  icon,
  fillsJson,
  legacySolid,
  legacyMode,
  legacyStopsJson,
  legacyPattern,
  legacyAngle,
  onConvertFromLegacy,
  onChangeFillsJson,
  onActivateGradientHandles,
}: {
  title: string;
  icon: any;
  fillsJson?: string;
  legacySolid: string;
  legacyMode: 'solid' | 'linear' | 'radial' | 'pattern';
  legacyStopsJson?: string;
  legacyPattern?: 'stripes' | 'dots' | 'checker';
  legacyAngle?: number;
  onConvertFromLegacy: () => void;
  onChangeFillsJson: (json: string) => void;
  onActivateGradientHandles: (layerId: string) => void;
}) {
  const parsed = useMemo(() => parseFillLayers(fillsJson), [fillsJson]);
  const layers = parsed === null ? null : parsed;
  const [selected, setSelected] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  useOutsideClick(menuRef, () => setMenuOpen(false), menuOpen);

  const dragging = useRef<number | null>(null);

  if (!layers) {
    return (
      <div className="nx-vsp-section">
        <div className="nx-vsp-sectionHeader">
          <div className="nx-vsp-title">{title}</div>
          <div className="nx-vsp-addWrap">
            <button type="button" className="nx-vsp-iconBtn" onClick={onConvertFromLegacy} title="Enable layers">
              <Layers size={14} />
            </button>
          </div>
        </div>
        <div className="nx-vsp-group">
          <div className="nx-vsp-hint">Currently using single-layer legacy paint.</div>
        </div>
      </div>
    );
  }

  const commit = (next: NxFillLayer[]) => {
    onChangeFillsJson(serializeFillLayers(next));
  };

  useEffect(() => {
    if (!layers.length) return;
    if (selected < layers.length) return;
    setSelected(Math.max(0, layers.length - 1));
  }, [layers.length, selected]);

  const sel = layers.length ? layers[Math.max(0, Math.min(selected, layers.length - 1))] : null;
  const selIdx = sel ? layers.indexOf(sel) : -1;
  const mode = (sel?.mode || 'solid') as any;

  return (
    <div className="nx-vsp-section">
      <div className="nx-vsp-sectionHeader">
        <div className="nx-vsp-title">{title}</div>
        <div className="nx-vsp-addWrap" ref={menuRef}>
          <button type="button" className="nx-vsp-iconBtn" onClick={() => setMenuOpen((v) => !v)} title="Add layer">
            <Plus size={14} />
          </button>
          {menuOpen ? (
            <div className="nx-vsp-menu">
              {(['solid', 'linear', 'radial', 'pattern'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  className="nx-vsp-menuItem"
                  onClick={() => {
                    const next = [
                      ...layers,
                      makeDefaultFillLayer({
                        mode: m as any,
                        solid: legacySolid,
                        stops: legacyStopsJson,
                        pattern: legacyPattern,
                        angle: legacyAngle,
                      } as any),
                    ];
                    commit(next);
                    setSelected(next.length - 1);
                    setMenuOpen(false);
                  }}
                >
                  <span className="nx-vsp-layerType">{typeLabel(m)}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
      <div className="nx-vsp-group">
        <div className="nx-vsp-layerList">
          {layers.map((l, i) => {
            const enabled = l.enabled !== false;
            const isSel = i === selIdx;
            return (
              <div
                key={l.id}
                className={isSel ? 'nx-vsp-layerItem is-selected' : 'nx-vsp-layerItem'}
                onClick={() => setSelected(i)}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (dragging.current === null) return;
                  const from = dragging.current;
                  const to = i;
                  if (from === to) return;
                  const next = reorder(layers, from, to);
                  commit(next);
                  dragging.current = to;
                  if (selected === from) setSelected(to);
                }}
                onDrop={() => {}}
              >
                <span
                  className="nx-vsp-dragHandle"
                  draggable
                  onDragStart={(e) => {
                    dragging.current = i;
                    try {
                      e.dataTransfer.effectAllowed = 'move';
                      // Required by Safari/Firefox to allow drop.
                      e.dataTransfer.setData('text/plain', String(i));
                    } catch {
                      // ignore
                    }
                  }}
                  onDragEnd={() => {
                    dragging.current = null;
                  }}
                  title="Drag to reorder"
                >
                  <GripVertical size={16} />
                </span>
                <span className="nx-vsp-layerType">{typeLabel(l.mode || 'solid')}</span>
                <span className="nx-vsp-layerSpacer" />
                <button
                  type="button"
                  className="nx-vsp-iconBtn"
                  onClick={(e) => {
                    e.stopPropagation();
                    commit(layers.map((x, j) => (j === i ? { ...x, enabled: !enabled } : x)));
                  }}
                  title={enabled ? 'Hide' : 'Show'}
                >
                  {enabled ? <Eye size={14} /> : <EyeOff size={14} />}
                </button>
                <button
                  type="button"
                  className="nx-vsp-iconBtn"
                  onClick={(e) => {
                    e.stopPropagation();
                    const next = layers.filter((_, j) => j !== i);
                    commit(next);
                    setSelected(Math.max(0, Math.min(selected, Math.max(0, next.length - 1))));
                  }}
                  title="Delete"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            );
          })}
        </div>

        {/* Selected layer editor */}
        {sel ? (
          <div className="nx-vsp-stack mt-2">
            {mode === 'solid' ? (
              <ColorPickerRow
                icon={icon}
                color={String(sel.solid || legacySolid)}
                onPick={(hex) => commit(layers.map((x, j) => (j === selIdx ? { ...x, solid: hex } : x)))}
                onCommitHex={(hex) => commit(layers.map((x, j) => (j === selIdx ? { ...x, solid: hex } : x)))}
              />
            ) : (
              <>
                <div className="nx-vsp-row">
                  <div className="nx-vsp-icon">{icon}</div>
                  <button
                    type="button"
                    className="nx-vsp-iconBtn"
                    onClick={() => onActivateGradientHandles(sel.id)}
                    disabled={mode !== 'linear'}
                    title="Gradient direction handles"
                  >
                    ∇
                  </button>
                  <div className="nx-vsp-hint flex-1">{mode === 'linear' ? 'Direction' : ''}</div>
                </div>
                <GradientStopsEditor
                  stops={
                    parseStopsJsonLoose(sel.stops) ||
                    parseStopsJsonLoose(legacyStopsJson) || [{ offset: 0, color: legacySolid }, { offset: 1, color: legacySolid }]
                  }
                  onChangeStops={(nextStops) =>
                    commit(layers.map((x, j) => (j === selIdx ? { ...x, stops: serializeStopsJson(nextStops as any) } : x)))
                  }
                />
                {mode === 'pattern' ? (
                  <div className="nx-vsp-row">
                    <div className="nx-vsp-icon">{icon}</div>
                    <select
                      className="nx-vsp-field"
                      value={String(sel.pattern || legacyPattern || 'stripes')}
                      onChange={(e) => commit(layers.map((x, j) => (j === selIdx ? { ...x, pattern: e.target.value as any } : x)))}
                      title="Pattern type"
                    >
                      <option value="stripes">Stripes</option>
                      <option value="dots">Dots</option>
                      <option value="checker">Checker</option>
                    </select>
                    <div className="nx-vsp-hint flex-1" />
                  </div>
                ) : null}
              </>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function NxStrokeStackSection({
  title,
  icon,
  strokesJson,
  legacySolid,
  legacyMode,
  legacyStopsJson,
  legacyPattern,
  legacyAngle,
  legacyWidth,
  strokeStacksDisabledReason,
  onConvertFromLegacy,
  onChangeStrokesJson,
  onActivateGradientHandles,
}: {
  title: string;
  icon: any;
  strokesJson?: string;
  legacySolid: string;
  legacyMode: 'solid' | 'linear' | 'radial' | 'pattern';
  legacyStopsJson?: string;
  legacyPattern?: 'stripes' | 'dots' | 'checker';
  legacyAngle?: number;
  legacyWidth: number;
  /** Optional: show a hint + disable enabling layers. */
  strokeStacksDisabledReason?: string | null;
  onConvertFromLegacy: () => void;
  onChangeStrokesJson: (json: string) => void;
  onActivateGradientHandles: (layerId: string) => void;
}) {
  const parsed = useMemo(() => parseStrokeLayers(strokesJson), [strokesJson]);
  const layers = parsed === null ? null : parsed;
  const [selected, setSelected] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  useOutsideClick(menuRef, () => setMenuOpen(false), menuOpen);
  const dragging = useRef<number | null>(null);

  if (!layers) {
    const disabled = !!strokeStacksDisabledReason;
    return (
      <div className="nx-vsp-section">
        <div className="nx-vsp-sectionHeader">
          <div className="nx-vsp-title">{title}</div>
          <div className="nx-vsp-addWrap">
            <button type="button" className="nx-vsp-iconBtn" onClick={onConvertFromLegacy} disabled={disabled} title="Enable layers">
              <Layers size={14} />
            </button>
          </div>
        </div>
        <div className="nx-vsp-group">
          <div className="nx-vsp-hint">{disabled ? strokeStacksDisabledReason : 'Currently using single-layer legacy outline.'}</div>
        </div>
      </div>
    );
  }

  const commit = (next: NxStrokeLayer[]) => {
    onChangeStrokesJson(serializeStrokeLayers(next));
  };

  useEffect(() => {
    if (!layers.length) return;
    if (selected < layers.length) return;
    setSelected(Math.max(0, layers.length - 1));
  }, [layers.length, selected]);

  const sel = layers.length ? layers[Math.max(0, Math.min(selected, layers.length - 1))] : null;
  const selIdx = sel ? layers.indexOf(sel) : -1;
  const mode = (sel?.mode || 'solid') as any;

  const dashKind = String(((sel as any)?.dash as any)?.kind || 'solid');
  const dashIsCustom = dashKind === 'custom';
  const dashArrayText =
    dashIsCustom && ((sel as any)?.dash as any)?.array
      ? String((((sel as any).dash.array as any[]) || []).map((n) => Number(n) || 0).join(','))
      : '6,4';
  const dashLen = dashKind === 'dashed' && Number.isFinite(((sel as any)?.dash as any)?.dashLength) ? Number(((sel as any).dash as any).dashLength) : 6;
  const gapLen = dashKind === 'dashed' && Number.isFinite(((sel as any)?.dash as any)?.gapLength) ? Number(((sel as any).dash as any).gapLength) : 4;

  const setDash = (next: NxDash) => commit(layers.map((x, j) => (j === selIdx ? ({ ...x, dash: next } as any) : x)));

  return (
    <div className="nx-vsp-section">
      <div className="nx-vsp-sectionHeader">
        <div className="nx-vsp-title">{title}</div>
        <div className="nx-vsp-addWrap" ref={menuRef}>
          <button type="button" className="nx-vsp-iconBtn" onClick={() => setMenuOpen((v) => !v)} title="Add layer">
            <Plus size={14} />
          </button>
          {menuOpen ? (
            <div className="nx-vsp-menu">
              {(['solid', 'linear', 'radial', 'pattern'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  className="nx-vsp-menuItem"
                  onClick={() => {
                    const next = [
                      ...layers,
                      makeDefaultStrokeLayer({
                        mode: m as any,
                        solid: legacySolid,
                        stops: legacyStopsJson,
                        pattern: legacyPattern,
                        angle: legacyAngle,
                        width: legacyWidth,
                      } as any),
                    ];
                    commit(next as any);
                    setSelected(next.length - 1);
                    setMenuOpen(false);
                  }}
                >
                  <span className="nx-vsp-layerType">{typeLabel(m)}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
      <div className="nx-vsp-group">
        <div className="nx-vsp-layerList">
          {layers.map((l, i) => {
            const enabled = l.enabled !== false;
            const isSel = i === selIdx;
            return (
              <div
                key={l.id}
                className={isSel ? 'nx-vsp-layerItem is-selected' : 'nx-vsp-layerItem'}
                onClick={() => setSelected(i)}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (dragging.current === null) return;
                  const from = dragging.current;
                  const to = i;
                  if (from === to) return;
                  const next = reorder(layers as any, from, to) as any;
                  commit(next);
                  dragging.current = to;
                  if (selected === from) setSelected(to);
                }}
                onDrop={() => {}}
              >
                <span
                  className="nx-vsp-dragHandle"
                  draggable
                  onDragStart={(e) => {
                    dragging.current = i;
                    try {
                      e.dataTransfer.effectAllowed = 'move';
                      e.dataTransfer.setData('text/plain', String(i));
                    } catch {
                      // ignore
                    }
                  }}
                  onDragEnd={() => {
                    dragging.current = null;
                  }}
                  title="Drag to reorder"
                >
                  <GripVertical size={16} />
                </span>
                <span className="nx-vsp-layerType">{typeLabel(l.mode || 'solid')}</span>
                <span className="nx-vsp-layerSpacer" />
                <button
                  type="button"
                  className="nx-vsp-iconBtn"
                  onClick={(e) => {
                    e.stopPropagation();
                    commit(layers.map((x, j) => (j === i ? ({ ...x, enabled: !enabled } as any) : x)) as any);
                  }}
                  title={enabled ? 'Hide' : 'Show'}
                >
                  {enabled ? <Eye size={14} /> : <EyeOff size={14} />}
                </button>
                <button
                  type="button"
                  className="nx-vsp-iconBtn"
                  onClick={(e) => {
                    e.stopPropagation();
                    const next = layers.filter((_, j) => j !== i);
                    commit(next as any);
                    setSelected(Math.max(0, Math.min(selected, Math.max(0, next.length - 1))));
                  }}
                  title="Delete"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            );
          })}
        </div>

        {/* Selected layer editor */}
        {sel ? <div className="nx-vsp-stack mt-2">
          {/* Most important: color first */}
          {mode === 'solid' ? (
            <ColorPickerRow
              icon={icon}
              color={String(sel.solid || legacySolid)}
              onPick={(hex) => commit(layers.map((x, j) => (j === selIdx ? ({ ...x, solid: hex } as any) : x)) as any)}
              onCommitHex={(hex) => commit(layers.map((x, j) => (j === selIdx ? ({ ...x, solid: hex } as any) : x)) as any)}
            />
          ) : (
            <>
              <div className="nx-vsp-row">
                <div className="nx-vsp-icon">{icon}</div>
                <button
                  type="button"
                  className="nx-vsp-iconBtn"
                  onClick={() => onActivateGradientHandles(sel.id)}
                  disabled={mode !== 'linear'}
                  title="Gradient direction handles"
                >
                  ∇
                </button>
                <div className="nx-vsp-hint flex-1">{mode === 'linear' ? 'Direction' : ''}</div>
              </div>
              <GradientStopsEditor
                stops={parseStopsJsonLoose(sel.stops) || parseStopsJsonLoose(legacyStopsJson) || [{ offset: 0, color: legacySolid }, { offset: 1, color: legacySolid }]}
                onChangeStops={(nextStops) =>
                  commit(layers.map((x, j) => (j === selIdx ? ({ ...x, stops: serializeStopsJson(nextStops as any) } as any) : x)) as any)
                }
              />
            </>
          )}

          {/* Secondary: width + alignment + dash + cap/join */}
          <div className="nx-vsp-row">
            <div className="nx-vsp-icon">{icon}</div>
            <input
              className="nx-vsp-number w-[96px]"
              type="number"
              min={0}
              max={256}
              value={Math.round(Number(sel.width ?? legacyWidth) || 0)}
              onChange={(e) => commit(layers.map((x, j) => (j === selIdx ? ({ ...x, width: clamp(Number(e.target.value || 0), 0, 256) } as any) : x)) as any)}
              title="Width"
            />
            <div className="nx-vsp-hint">px</div>
            <IconGroup
              value={String((sel as any).align || 'center')}
              options={[
                { id: 'inside', title: 'Inside', icon: ArrowDownToLine },
                { id: 'center', title: 'Center', icon: ArrowLeftRight },
                { id: 'outside', title: 'Outside', icon: ArrowUpToLine },
              ]}
              onChange={(id) => commit(layers.map((x, j) => (j === selIdx ? ({ ...x, align: id as any } as any) : x)) as any)}
            />
          </div>

          <div className="nx-vsp-row">
            <div className="nx-vsp-icon">{icon}</div>
            <select
              className="nx-vsp-field"
              value={dashKind}
              onChange={(e) => {
                const k = e.target.value;
                if (k === 'custom') setDash({ kind: 'custom', array: [6, 4] } as any);
                else if (k === 'dashed') setDash({ kind: 'dashed', dashLength: 6, gapLength: 4 } as any);
                else setDash({ kind: k as any } as any);
              }}
              title="Dash"
            >
              {dashKindOptions().map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          {dashKind === 'dashed' ? (
            <div className="nx-vsp-row">
              <div className="nx-vsp-icon">{icon}</div>
              <div className="nx-vsp-hint">Dash</div>
              <input
                className="nx-vsp-number w-[96px]"
                type="number"
                min={0.5}
                step={0.5}
                value={dashLen}
                onChange={(e) => setDash({ kind: 'dashed', dashLength: Math.max(0.5, Number(e.target.value || 0.5)), gapLength: gapLen } as any)}
                title="Dash length"
              />
              <div className="nx-vsp-hint">Gap</div>
              <input
                className="nx-vsp-number w-[96px]"
                type="number"
                min={0.5}
                step={0.5}
                value={gapLen}
                onChange={(e) => setDash({ kind: 'dashed', dashLength: dashLen, gapLength: Math.max(0.5, Number(e.target.value || 0.5)) } as any)}
                title="Gap length"
              />
            </div>
          ) : null}

          {dashIsCustom ? (
            <div className="nx-vsp-row">
              <div className="nx-vsp-icon">{icon}</div>
              <div className="nx-vsp-hint">Array</div>
              <input
                className="nx-vsp-field tabular-nums"
                value={dashArrayText}
                onChange={(e) => {
                  const parts = String(e.target.value || '')
                    .split(/[,\s]+/)
                    .map((x) => Math.max(0, Number(x) || 0))
                    .filter((n) => n > 0);
                  setDash({ kind: 'custom', array: parts.length ? parts : [6, 4] } as any);
                }}
                title="Dash array (comma separated)"
              />
              <div className="nx-vsp-hint flex-1">e.g. 6,4</div>
            </div>
          ) : null}

          {/* Cap + Join combined */}
          <div className="nx-vsp-row">
            <div className="nx-vsp-icon">{icon}</div>
            <select
              className="nx-vsp-field"
              value={String((sel as any).cap || 'round')}
              onChange={(e) => commit(layers.map((x, j) => (j === selIdx ? ({ ...x, cap: e.target.value as any } as any) : x)) as any)}
              title="Cap"
            >
              <option value="round">Round cap</option>
              <option value="butt">Butt cap</option>
              <option value="square">Square cap</option>
            </select>
            <select
              className="nx-vsp-field"
              value={String((sel as any).join || 'round')}
              onChange={(e) => commit(layers.map((x, j) => (j === selIdx ? ({ ...x, join: e.target.value as any } as any) : x)) as any)}
              title="Join"
            >
              <option value="round">Round join</option>
              <option value="miter">Miter join</option>
              <option value="bevel">Bevel join</option>
            </select>
          </div>
        </div> : null}
      </div>
    </div>
  );
}

