import type { ReactNode } from 'react';
import type { Components } from 'react-markdown';
import type { GridPersonV1 } from '@/lib/gridjson';
import { toggleRadioInLine } from '@/lib/grid-cell-macros';
import { nxSemanticTextColor } from '@/lib/grid/nxSemanticColor';

function parseMacroBody(body: string): { head: string; flags: Set<string>; kv: Record<string, string> } {
  const segs = String(body || '')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
  const head = segs[0] ?? '';
  const flags = new Set<string>();
  const kv: Record<string, string> = {};
  segs.slice(1).forEach((s) => {
    const eq = s.indexOf('=');
    if (eq === -1) flags.add(s);
    else {
      const k = s.slice(0, eq).trim();
      const v = s.slice(eq + 1).trim();
      if (k) kv[k] = v;
    }
  });
  return { head, flags, kv };
}

function parseMacroArgs(body: string): { flags: Set<string>; kv: Record<string, string> } {
  const segs = String(body || '')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
  const flags = new Set<string>();
  const kv: Record<string, string> = {};
  segs.forEach((s) => {
    const eq = s.indexOf('=');
    if (eq === -1) flags.add(s);
    else {
      const k = s.slice(0, eq).trim();
      const v = s.slice(eq + 1).trim();
      if (k) kv[k] = v;
    }
  });
  return { flags, kv };
}

function initials(name: string): string {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const a = (parts[0] || '').slice(0, 1).toUpperCase();
  const b = (parts[1] || parts[0] || '').slice(1, 2).toUpperCase();
  return (a + b).trim() || '?';
}

export type MacroPopoverKind = 'pills' | 'people' | 'date';

export function createNxMarkdownComponents(opts: {
  pillsExpandAll: boolean;
  peopleDirectory: GridPersonV1[];
  onReplaceMacro: (occ: number, nextRaw: string) => void;
  onTransformText?: (transform: (prev: string) => string) => void;
  onOpenPopover: (kind: MacroPopoverKind, occ: number, body: string, anchorEl: HTMLElement) => void;
}): Components {
  const { pillsExpandAll, peopleDirectory, onReplaceMacro, onTransformText, onOpenPopover } = opts;

  const parseOcc = (v: unknown): number => {
    const n = Number.parseInt(String(v ?? ''), 10);
    return Number.isFinite(n) ? n : -1;
  };

  const commonText = {
    p: ({ children }: { children: ReactNode }) => <p className="m-0">{children}</p>,
    a: ({ children, href }: { children: ReactNode; href?: string }) => (
      <a href={href} target="_blank" rel="noreferrer" className="text-blue-700 underline underline-offset-2">
        {children}
      </a>
    ),
    ul: ({ children }: { children: ReactNode }) => <ul className="m-0 pl-4 list-disc">{children}</ul>,
    ol: ({ children }: { children: ReactNode }) => <ol className="m-0 pl-4 list-decimal">{children}</ol>,
    li: ({ children }: { children: ReactNode }) => <li className="m-0">{children}</li>,
    code: ({ children }: { children: ReactNode }) => (
      <code className="px-0.5 py-[1px] rounded bg-slate-100 font-mono text-[10px]">{children}</code>
    ),
    pre: ({ children }: { children: ReactNode }) => <pre className="m-0 p-1 rounded bg-slate-100 overflow-x-auto text-[10px]">{children}</pre>,
    h1: ({ children }: { children: ReactNode }) => <h1 className="m-0 text-xl font-bold leading-snug">{children}</h1>,
    h2: ({ children }: { children: ReactNode }) => <h2 className="m-0 text-lg font-bold leading-snug">{children}</h2>,
    h3: ({ children }: { children: ReactNode }) => <h3 className="m-0 text-base font-semibold leading-snug">{children}</h3>,
    h4: ({ children }: { children: ReactNode }) => <h4 className="m-0 text-sm font-semibold leading-snug">{children}</h4>,
    h5: ({ children }: { children: ReactNode }) => <h5 className="m-0 text-xs font-semibold leading-snug opacity-90">{children}</h5>,
    h6: ({ children }: { children: ReactNode }) => <h6 className="m-0 text-xs font-semibold leading-snug opacity-80">{children}</h6>,
  } as const;

  return {
    ...commonText,

    'nx-color': ({ children, kind, mode }: { children: ReactNode; kind?: string; mode?: string }) => {
      // For mode=bg, the cell background is handled at the cell level (full-cell fill).
      // Here we only set text color so inline spans don't double-highlight.
      const m = String(mode || 'text').trim().toLowerCase();
      const color = nxSemanticTextColor(kind);
      return (
        <span className={`rounded px-0.5 ${m === 'bg' ? '' : ''}`} style={{ color }}>
          {children}
        </span>
      );
    },

    'nx-icon': ({ body }: { body?: string }) => {
      const t = String(body || '').trim();
      const shown = t || '★';
      return <span className="inline-flex items-center justify-center min-w-[14px]">{shown}</span>;
    },

    'nx-check': ({ body, occ, raw }: { body?: string; occ?: string; raw?: string }) => {
      const idx = parseOcc(occ);
      const checked = String(body || '').trim() === '1' || String(body || '').trim().toLowerCase() === 'true';
      return (
        <button
          type="button"
          data-nx-interactive="1"
          className="inline-flex items-center justify-center w-4 h-4 rounded border border-slate-400 bg-white hover:bg-slate-50"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            const nextChecked = !checked;
            const r = String(raw || '');
            if (r.startsWith('[')) {
              const nextRaw = nextChecked ? '[x]' : r === '[]' ? '[]' : '[ ]';
              onReplaceMacro(idx, nextRaw);
            } else {
              onReplaceMacro(idx, `[[check:${nextChecked ? 1 : 0}]]`);
            }
          }}
          title="Checkbox"
        >
          <span className={`text-[12px] leading-none ${checked ? 'opacity-100' : 'opacity-0'}`}>✓</span>
        </button>
      );
    },

    'nx-progress': ({ body, occ, raw }: { body?: string; occ?: string; raw?: string }) => {
      const idx = parseOcc(occ);
      const { head, flags } = parseMacroBody(String(body || ''));
      const pct = Math.max(0, Math.min(100, Math.round(Number(head) || 0)));
      const draggable = flags.has('drag');
      return (
        <span
          data-nx-interactive="1"
          className={`inline-flex items-center gap-1.5 select-none ${draggable ? 'cursor-ew-resize' : ''}`}
          onPointerDown={(e) => {
            if (!draggable) return;
            e.stopPropagation();
            const el = e.currentTarget as HTMLElement;
            const rect = el.getBoundingClientRect();
            const setFromX = (x: number) => {
              const f = (x - rect.left) / Math.max(1, rect.width);
              const v = Math.max(0, Math.min(100, Math.round(f * 100)));
              const r = String(raw || '');
              if (r.startsWith('%%')) onReplaceMacro(idx, `%%${v}!`);
              else onReplaceMacro(idx, `[[progress:${v};drag]]`);
            };
            setFromX(e.clientX);
            const onMove = (ev: PointerEvent) => setFromX(ev.clientX);
            const onUp = () => {
              window.removeEventListener('pointermove', onMove);
              window.removeEventListener('pointerup', onUp);
            };
            window.addEventListener('pointermove', onMove);
            window.addEventListener('pointerup', onUp);
          }}
        >
          <span className="w-[70px] h-2 rounded bg-slate-200 overflow-hidden inline-block align-middle">
            <span className="h-full bg-slate-700 block" style={{ width: `${pct}%` }} />
          </span>
          <span className="text-[10px] tabular-nums opacity-80">{pct}%</span>
        </span>
      );
    },

    'nx-date': ({ body, occ }: { body?: string; occ?: string }) => {
      const idx = parseOcc(occ);
      const t = String(body || '').trim();
      return (
        <button
          type="button"
          data-nx-interactive="1"
          className="inline-flex items-center gap-1 text-[10px] px-1 py-0.5 rounded bg-slate-100 hover:bg-slate-200"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onOpenPopover('date', idx, t, e.currentTarget as HTMLElement);
          }}
        >
          <span className="opacity-70">📅</span>
          <span>{t || 'Pick date'}</span>
        </button>
      );
    },

    'nx-pills': ({ body, occ }: { body?: string; occ?: string }) => {
      const idx = parseOcc(occ);
      const { head, kv } = parseMacroBody(String(body || ''));
      const tags = head
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const max = Math.max(1, Math.round(Number(kv.max) || 3));
      const shown = pillsExpandAll ? tags : tags.slice(0, max);
      const hidden = Math.max(0, tags.length - shown.length);
      return (
        <button
          type="button"
          data-nx-interactive="1"
          className="inline-flex flex-wrap items-center gap-1.5 text-[10px] mr-1 max-w-full overflow-hidden"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onOpenPopover('pills', idx, String(body || ''), e.currentTarget as HTMLElement);
          }}
          title={tags.join(', ')}
        >
          {shown.map((t) => (
            <span key={t} className="px-1.5 py-0.5 rounded-full bg-slate-100 border border-slate-200 max-w-[90px] truncate">
              {t}
            </span>
          ))}
          {hidden ? <span className="opacity-70">+{hidden} more</span> : null}
          {tags.length === 0 ? <span className="opacity-70">+ tag</span> : null}
        </button>
      );
    },

    'nx-people': ({ body, occ }: { body?: string; occ?: string }) => {
      const idx = parseOcc(occ);
      const { head } = parseMacroBody(String(body || ''));
      const tokens = head
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const resolved = tokens.map((t) => {
        if (t.startsWith('@')) {
          const id = t.slice(1);
          const p = peopleDirectory.find((x) => x.id === id) || null;
          if (!p) return { token: t, label: id, icon: undefined };
          return { token: t, label: p.name, icon: p.icon };
        }
        const key = t.trim().toLowerCase();
        const p = peopleDirectory.find((x) => x.name.trim().toLowerCase() === key) || null;
        return { token: t, label: t, icon: p?.icon };
      });
      return (
        <button
          type="button"
          data-nx-interactive="1"
          className="inline-flex flex-wrap items-center gap-1 text-[10px] max-w-full overflow-hidden"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onOpenPopover('people', idx, String(body || ''), e.currentTarget as HTMLElement);
          }}
          title={resolved.map((r) => r.label).join(', ')}
        >
          {resolved.slice(0, 6).map((p) => (
            <span key={p.token} className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-slate-900 text-white text-[9px]">
              {p.icon ? p.icon : initials(p.label)}
            </span>
          ))}
          {resolved.length > 6 ? <span className="opacity-70">+{resolved.length - 6}</span> : null}
          {resolved.length === 0 ? <span className="opacity-70">+ person</span> : null}
        </button>
      );
    },

    'nx-radio': ({ body, occ, raw }: { body?: string; occ?: string; raw?: string }) => {
      const idx = parseOcc(occ);
      const r = String(raw || '');
      const tokenMode = r.startsWith('(');

      if (tokenMode) {
        const filled = String(body || '').trim() === '1';
        return (
          <button
            type="button"
            data-nx-interactive="1"
            className="inline-flex items-center justify-center w-4 h-4 rounded-full border border-slate-400 bg-white hover:bg-slate-50"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              if (onTransformText) onTransformText((prev) => toggleRadioInLine(prev, idx));
              else onReplaceMacro(idx, filled ? '( )' : '(o)');
            }}
            title="Radio"
          >
            <span className={`w-2 h-2 rounded-full ${filled ? 'bg-slate-900' : 'bg-transparent'}`} />
          </button>
        );
      }

      const { kv } = parseMacroArgs(String(body || ''));
      const opts = String(kv.opts || '')
        .split('|')
        .map((s) => s.trim())
        .filter(Boolean);
      const value = String(kv.value || '').trim();
      const group = String(kv.group || '').trim();
      if (!opts.length) return <span className="opacity-70">( )</span>;
      const set = (v: string) => onReplaceMacro(idx, `[[radio:group=${group};value=${v};opts=${opts.join('|')}]]`);
      return (
        <span className="inline-flex items-center gap-2">
          {opts.map((o) => {
            const filled = o === value;
            return (
              <button
                key={o}
                type="button"
                data-nx-interactive="1"
                className="inline-flex items-center gap-1 text-[10px]"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  set(o);
                }}
                title={o}
              >
                <span className="inline-flex items-center justify-center w-4 h-4 rounded-full border border-slate-400 bg-white">
                  <span className={`w-2 h-2 rounded-full ${filled ? 'bg-slate-900' : 'bg-transparent'}`} />
                </span>
                <span>{o}</span>
              </button>
            );
          })}
        </span>
      );
    },

    'nx-seg': ({ body, occ, raw }: { body?: string; occ?: string; raw?: string }) => {
      const idx = parseOcc(occ);
      const { kv } = parseMacroArgs(String(body || ''));
      const opts = String(kv.opts || '')
        .split('|')
        .map((s) => s.trim())
        .filter(Boolean);
      const icons = String(kv.icons || '')
        .split('|')
        .map((s) => s.trim());
      const value = String(kv.value || '').trim();
      const mode = String(kv.mode || '').trim();
      if (!opts.length) return <span className="opacity-70">[seg]</span>;
      const set = (v: string) => {
        const r = String(raw || '');
        if (r.startsWith('{{')) {
          onReplaceMacro(idx, `{{${opts.map((o) => (o === v ? `*${o}` : o)).join('|')}}}`);
        } else {
          const iconPart = kv.icons ? `;icons=${kv.icons}` : '';
          const modePart = mode ? `;mode=${mode}` : '';
          onReplaceMacro(idx, `[[seg:opts=${opts.join('|')};value=${v}${iconPart}${modePart}]]`);
        }
      };
      return (
        <span
          className="inline-flex items-center rounded border border-slate-200 max-w-full overflow-x-auto"
          style={{ scrollbarWidth: 'none' }}
          data-nx-interactive="1"
        >
          {opts.map((o, i) => (
            <button
              key={o}
              type="button"
              data-nx-interactive="1"
              className={`px-2 py-0.5 text-[10px] border-r last:border-r-0 border-slate-200 inline-flex items-center gap-1 ${
                o === value ? 'bg-slate-900 text-white' : 'bg-white hover:bg-slate-50'
              }`}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                set(o);
              }}
              title={o}
            >
              {icons[i] ? <span className="opacity-90">{icons[i]}</span> : null}
              {mode === 'icon' ? null : <span>{o}</span>}
            </button>
          ))}
        </span>
      );
    },
  } as any;
}

