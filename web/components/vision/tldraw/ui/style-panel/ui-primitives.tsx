'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { toHexOrEmpty } from '@/components/vision/tldraw/ui/style-panel/color-utils';
import { clamp01, normalizeStops, type GradientStop } from '@/components/vision/tldraw/lib/gradient-stops';

export function Swatch({
  color,
  title,
  onClick,
  mixed,
}: {
  color: string;
  title?: string;
  onClick?: () => void;
  mixed?: boolean;
}) {
  return (
    <button
      type="button"
      className="nx-vsp-swatch"
      style={
        mixed
          ? {
              backgroundImage:
                'linear-gradient(45deg, rgba(0,0,0,.10) 25%, transparent 25%, transparent 75%, rgba(0,0,0,.10) 75%, rgba(0,0,0,.10)), linear-gradient(45deg, rgba(0,0,0,.10) 25%, transparent 25%, transparent 75%, rgba(0,0,0,.10) 75%, rgba(0,0,0,.10))',
              backgroundSize: '10px 10px',
              backgroundPosition: '0 0, 5px 5px',
            }
          : { background: color }
      }
      onClick={onClick}
      title={title}
      aria-label={title || 'Pick color'}
    />
  );
}

export function StopSwatch({
  color,
  title,
  onPick,
}: {
  color: string;
  title: string;
  onPick: (hex: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  return (
    <>
      <Swatch color={color} title={title} onClick={() => inputRef.current?.click()} />
      <input
        ref={inputRef}
        type="color"
        value={color}
        className="sr-only"
        onChange={(e) => onPick(String(e.target.value || color))}
      />
    </>
  );
}

export function ColorHexField({
  value,
  placeholder,
  onCommitHex,
  disabled,
}: {
  value: string;
  placeholder?: string;
  onCommitHex: (hex: string) => void;
  disabled?: boolean;
}) {
  return (
    <input
      className="nx-vsp-field tabular-nums disabled:opacity-60"
      value={value}
      disabled={disabled}
      placeholder={placeholder || '#rrggbb'}
      onChange={(e) => {
        const hex = toHexOrEmpty(e.target.value);
        if (!hex) return;
        onCommitHex(hex);
      }}
    />
  );
}

export function ColorPickerRow({
  icon,
  color,
  mixed,
  placeholder,
  onPick,
  onCommitHex,
  disabled,
}: {
  icon: ReactNode;
  color: string;
  mixed?: boolean;
  placeholder?: string;
  onPick: (hex: string) => void;
  onCommitHex: (hex: string) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  return (
    <div className="nx-vsp-row">
      <div className="nx-vsp-icon">{icon}</div>
      <Swatch
        color={color}
        mixed={mixed}
        onClick={() => (disabled ? null : inputRef.current?.click())}
        title={mixed ? 'Mixed' : color}
      />
      <input
        ref={inputRef}
        type="color"
        value={mixed ? '#000000' : color}
        onChange={(e) => onPick(String(e.target.value || '#000000'))}
        className="sr-only"
        disabled={disabled}
      />
      <ColorHexField value={mixed ? '' : color} placeholder={placeholder} onCommitHex={onCommitHex} disabled={disabled} />
    </div>
  );
}

export function GradientStopsEditor({
  stops,
  onChangeStops,
  disabled,
}: {
  stops: GradientStop[];
  onChangeStops: (next: GradientStop[]) => void;
  disabled?: boolean;
}) {
  const barRef = useRef<HTMLDivElement | null>(null);
  const [selected, setSelected] = useState(0);
  const [dragging, setDragging] = useState<number | null>(null);

  const normStops = useMemo(() => normalizeStops(stops), [stops]);

  useEffect(() => {
    if (selected >= normStops.length) setSelected(Math.max(0, normStops.length - 1));
  }, [normStops.length, selected]);

  const cssGradient = useMemo(() => {
    const parts = normStops.map((s) => `${s.color} ${(s.offset * 100).toFixed(1)}%`);
    return `linear-gradient(90deg, ${parts.join(', ')})`;
  }, [normStops]);

  const commit = (next: GradientStop[]) => onChangeStops(normalizeStops(next));

  const setOffsetAt = (idx: number, offset: number) => {
    const next = normStops.map((s, i) => (i === idx ? { ...s, offset: clamp01(offset) } : s));
    commit(next);
  };

  const setColorAt = (idx: number, color: string) => {
    const hex = toHexOrEmpty(color) || normStops[idx]?.color || '#000000';
    const next = normStops.map((s, i) => (i === idx ? { ...s, color: hex } : s));
    commit(next);
  };

  const addStopAt = (offset: number) => {
    const o = clamp01(offset);
    // choose neighbor color (simple: interpolate by nearest)
    let best = normStops[0];
    for (const s of normStops) {
      if (Math.abs(s.offset - o) < Math.abs(best.offset - o)) best = s;
    }
    const next = [...normStops, { offset: o, color: best.color }];
    const normalized = normalizeStops(next);
    const idx = normalized.findIndex((s) => Math.abs(s.offset - o) < 1e-6 && s.color === best.color);
    commit(normalized);
    setSelected(Math.max(0, idx));
  };

  const removeSelected = () => {
    if (normStops.length <= 2) return;
    const next = normStops.filter((_, i) => i !== selected);
    commit(next);
    setSelected(Math.max(0, Math.min(selected, next.length - 1)));
  };

  const onBarPointerDown = (e: React.PointerEvent) => {
    if (disabled) return;
    if (!barRef.current) return;
    // only add if user clicked on empty bar area (not a stop)
    const target = e.target as HTMLElement | null;
    if (target && target.dataset && target.dataset.stop === '1') return;
    const r = barRef.current.getBoundingClientRect();
    const o = (e.clientX - r.left) / Math.max(1, r.width);
    addStopAt(o);
  };

  const onStopPointerDown = (idx: number, e: React.PointerEvent) => {
    if (disabled) return;
    setSelected(idx);
    setDragging(idx);
    try {
      (e.currentTarget as any)?.setPointerCapture?.(e.pointerId);
    } catch {
      // ignore
    }
  };

  // Drag UX: keep updating even when cursor leaves the gradient bar.
  useEffect(() => {
    if (disabled) return;
    if (dragging === null) return;
    const onMove = (e: PointerEvent) => {
      if (!barRef.current) return;
      const r = barRef.current.getBoundingClientRect();
      const o = (e.clientX - r.left) / Math.max(1, r.width);
      setOffsetAt(dragging, o);
    };
    const onUp = () => setDragging(null);
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerup', onUp, { passive: true });
    window.addEventListener('pointercancel', onUp, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragging, disabled, barRef.current]);

  const sel = normStops[selected] || normStops[0];
  const selHex = sel?.color || '#000000';

  return (
    <div className="nx-vsp-row">
      <div className="nx-vsp-icon">∇</div>
      <div className="nx-vsp-grad">
        <div
          ref={barRef}
          className="nx-vsp-gradBar"
          style={{ backgroundImage: cssGradient }}
          onPointerDown={onBarPointerDown}
        >
          {normStops.map((s, i) => (
            <button
              key={`${i}-${s.offset}`}
              type="button"
              data-stop="1"
              className={i === selected ? 'nx-vsp-gradStop is-selected' : 'nx-vsp-gradStop'}
              style={{ left: `${(s.offset * 100).toFixed(2)}%`, background: s.color }}
              onPointerDown={(e) => onStopPointerDown(i, e)}
              title={`${s.color} @ ${(s.offset * 100).toFixed(0)}%`}
              aria-label={`Gradient stop ${i + 1}`}
              disabled={disabled}
            />
          ))}
        </div>
        <div className="nx-vsp-gradControls">
          <input
            type="color"
            className="nx-vsp-gradColor"
            value={selHex}
            onChange={(e) => setColorAt(selected, String(e.target.value || selHex))}
            disabled={disabled}
            title="Stop color"
          />
          <input
            className="nx-vsp-number w-[92px]"
            type="number"
            min={0}
            max={100}
            value={Math.round((sel?.offset || 0) * 100)}
            onChange={(e) => setOffsetAt(selected, Number(e.target.value || 0) / 100)}
            disabled={disabled}
            title="Stop position (%)"
          />
          <input
            className="nx-vsp-field w-[120px] tabular-nums"
            value={selHex}
            onChange={(e) => {
              const hex = toHexOrEmpty(e.target.value);
              if (!hex) return;
              setColorAt(selected, hex);
            }}
            disabled={disabled}
            title="Stop hex"
          />
          <button type="button" className="nx-vsp-miniBtn" onClick={removeSelected} disabled={disabled || normStops.length <= 2}>
            Remove
          </button>
        </div>
      </div>
    </div>
  );
}

