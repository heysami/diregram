'use client';

import {
  normalizeVisionDesignSystem,
  VISION_GOOGLE_FONT_OPTIONS,
  VISION_TAILWIND_PRIMITIVE_COLORS,
  type VisionColorRatioV1,
  type VisionDesignSystemV1,
  type VisionImageProfileV1,
  type VisionPrimitiveColorOption,
  type VisionPrimitiveRatioEntryV1,
  type VisionSemanticPaletteV1,
} from '@/lib/vision-design-system';

type Props = {
  value: VisionDesignSystemV1;
  onChange: (next: VisionDesignSystemV1) => void;
};

const NEUTRAL_PRIMITIVES = VISION_TAILWIND_PRIMITIVE_COLORS.filter((c) => c.kind === 'neutral');
const ACCENT_PRIMITIVES = VISION_TAILWIND_PRIMITIVE_COLORS.filter((c) => c.kind === 'accent');
const ALL_PRIMITIVES = VISION_TAILWIND_PRIMITIVE_COLORS;
const SEMANTIC_KEYS: Array<keyof VisionSemanticPaletteV1> = ['success', 'warning', 'error', 'info'];
const FONT_VARIANCE_OPTIONS = [
  {
    id: 'single',
    label: 'Single font',
    description: 'One font family for all UI/content/decorative text.',
  },
  {
    id: 'singleDecorative',
    label: 'Single + decorative',
    description: 'Base font for all, plus special decorative font for selective highlights.',
  },
  {
    id: 'splitHeading',
    label: 'Split heading',
    description: 'Header/title font differs from normal UI and body text.',
  },
  {
    id: 'splitHeadingDecorative',
    label: 'Split + decorative',
    description: 'Heading font differs, plus another decorative accent font.',
  },
] as const;

function clamp(v: number, min: number, max: number) {
  if (!Number.isFinite(v)) return min;
  if (v < min) return min;
  if (v > max) return max;
  return v;
}

function normalizeHexLoose(input: string, fallback: string) {
  const raw = String(input || '').trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(raw)) return raw;
  if (/^#[0-9a-f]{3}$/.test(raw)) return `#${raw[1]}${raw[1]}${raw[2]}${raw[2]}${raw[3]}${raw[3]}`;
  return fallback;
}

function cloneSpec(value: VisionDesignSystemV1): VisionDesignSystemV1 {
  return JSON.parse(JSON.stringify(value)) as VisionDesignSystemV1;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error || new Error('Failed to read file.'));
    reader.readAsDataURL(file);
  });
}

function findPrimitive(id: string): VisionPrimitiveColorOption | null {
  const key = String(id || '').trim();
  if (!key) return null;
  return ALL_PRIMITIVES.find((it) => it.id === key) || null;
}

function parsePrimitiveFamily(id: string): string {
  const m = String(id || '').trim().toLowerCase().match(/^([a-z]+)-\d{2,3}$/);
  return m ? m[1] : '';
}

function ratioEntries(row: VisionColorRatioV1): VisionPrimitiveRatioEntryV1[] {
  if (Array.isArray(row.primitiveBreakdown) && row.primitiveBreakdown.length) {
    return row.primitiveBreakdown.map((it, idx) => ({
      id: String(it.id || `entry-${idx + 1}`),
      primitiveId: String(it.primitiveId || 'primary'),
      pct: clamp(Math.round(Number(it.pct || 0)), 0, 100),
      usage: it.usage || 'item',
    }));
  }
  const out: VisionPrimitiveRatioEntryV1[] = [];
  if (row.neutralPct > 0) out.push({ id: 'neutral', primitiveId: 'slate-100', pct: row.neutralPct, usage: 'surface' });
  if (row.primaryPct > 0) out.push({ id: 'primary', primitiveId: 'primary', pct: row.primaryPct, usage: 'item' });
  if (row.accentPct > 0) out.push({ id: 'accent', primitiveId: 'violet-600', pct: row.accentPct, usage: 'item' });
  if (row.semanticPct > 0) out.push({ id: 'semantic', primitiveId: 'green-600', pct: row.semanticPct, usage: 'item' });
  return out.length ? out : [{ id: 'neutral', primitiveId: 'slate-100', pct: 100, usage: 'surface' }];
}

function summarizeRatio(entries: VisionPrimitiveRatioEntryV1[]) {
  let neutralPct = 0;
  let primaryPct = 0;
  let accentPct = 0;
  const semanticPct = 0;
  for (const entry of entries) {
    const pct = clamp(Math.round(Number(entry.pct || 0)), 0, 100);
    if (entry.primitiveId === 'primary') {
      primaryPct += pct;
      continue;
    }
    const primitive = findPrimitive(entry.primitiveId);
    if (!primitive) {
      accentPct += pct;
      continue;
    }
    if (primitive.kind === 'neutral') neutralPct += pct;
    else accentPct += pct;
  }
  return {
    neutralPct: clamp(neutralPct, 0, 100),
    primaryPct: clamp(primaryPct, 0, 100),
    accentPct: clamp(accentPct, 0, 100),
    semanticPct: clamp(semanticPct, 0, 100),
  };
}

function normalizeRatioEntries(entries: VisionPrimitiveRatioEntryV1[]): VisionPrimitiveRatioEntryV1[] {
  const total = entries.reduce((acc, it) => acc + clamp(Math.round(Number(it.pct || 0)), 0, 100), 0);
  if (total <= 0) return [{ id: 'neutral', primitiveId: 'slate-100', pct: 100, usage: 'surface' }];
  return entries.map((it) => ({
    ...it,
    pct: clamp(Math.round((clamp(Math.round(Number(it.pct || 0)), 0, 100) / total) * 100), 0, 100),
  }));
}

function ratioTotal(entries: VisionPrimitiveRatioEntryV1[]): number {
  return entries.reduce((acc, it) => acc + clamp(Math.round(Number(it.pct || 0)), 0, 100), 0);
}

function SliderRow({
  label,
  helper,
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
}: {
  label: string;
  helper?: string;
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <label className="vds-slider-row">
      <div className="vds-slider-row__head">
        <span>{label}</span>
        <span className="vds-slider-row__value">{Math.round(value)}</span>
      </div>
      {helper ? <div className="vds-slider-row__helper">{helper}</div> : null}
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

function PrimitiveBadge({ value, fallbackLabel = 'unset' }: { value?: string; fallbackLabel?: string }) {
  const primitive = findPrimitive(String(value || ''));
  const label = primitive?.name || fallbackLabel;
  const color = primitive?.hex || '#cbd5e1';
  return (
    <span className="vds-primitive-badge">
      <span className="vds-primitive-badge__swatch" style={{ background: color }} />
      {label}
    </span>
  );
}

export function DesignSystemControls({ value, onChange }: Props) {
  const activeScenarioIndex = Math.max(0, value.scenarios.findIndex((s) => s.id === value.activeScenarioId));
  const activeScenario = value.scenarios[activeScenarioIndex] || value.scenarios[0];

  const selectedFont =
    VISION_GOOGLE_FONT_OPTIONS.find((f) => f.family === value.foundations.fontFamily)?.id ||
    VISION_GOOGLE_FONT_OPTIONS.find((f) => value.foundations.fontFamily.includes(f.label))?.id ||
    'custom';

  const commit = (updater: (draft: VisionDesignSystemV1) => void) => {
    const draft = cloneSpec(value);
    updater(draft);
    draft.updatedAt = new Date().toISOString();
    onChange(normalizeVisionDesignSystem(draft));
  };

  const withActiveScenario = (draft: VisionDesignSystemV1, updater: (scenario: VisionDesignSystemV1['scenarios'][number]) => void) => {
    const sIndex = Math.max(0, draft.scenarios.findIndex((s) => s.id === draft.activeScenarioId));
    const scenario = draft.scenarios[sIndex] || draft.scenarios[0];
    if (!scenario) return;
    updater(scenario);
  };

  const ensurePairings = (scenario: VisionDesignSystemV1['scenarios'][number]) => {
    if (!scenario.palette.pairings) {
      scenario.palette.pairings = {
        primaryPrimitive: 'blue-600',
        accentPrimitives: ['violet-600', 'orange-500'],
        neutralPrimitives: ['slate-50', 'slate-200', 'slate-700'],
        semanticPrimitives: {},
        primitiveOverrides: {},
      };
    }
    if (!scenario.palette.pairings.accentPrimitives) scenario.palette.pairings.accentPrimitives = [];
    if (!scenario.palette.pairings.neutralPrimitives) scenario.palette.pairings.neutralPrimitives = [];
    if (!scenario.palette.pairings.semanticPrimitives) scenario.palette.pairings.semanticPrimitives = {};
    if (!scenario.palette.pairings.primitiveOverrides) scenario.palette.pairings.primitiveOverrides = {};
  };

  const setRatioEntries = (rowIndex: number, entries: VisionPrimitiveRatioEntryV1[]) => {
    commit((draft) => {
      withActiveScenario(draft, (scenario) => {
        const row = scenario.ratios[rowIndex] || scenario.ratios[0];
        if (!row) return;
        const normalizedEntries = entries.map((it) => ({
          ...it,
          pct: clamp(Math.round(Number(it.pct || 0)), 0, 100),
          primitiveId: String(it.primitiveId || 'primary'),
          usage: it.usage || 'item',
        }));
        const summary = summarizeRatio(normalizedEntries);
        scenario.ratios[rowIndex] = {
          ...row,
          ...summary,
          primitiveBreakdown: normalizedEntries,
        };
      });
    });
  };

  const upsertImage = (imageIndex: number, patch: Partial<VisionImageProfileV1>) => {
    commit((draft) => {
      const next = draft.foundations.imageProfiles[imageIndex];
      if (!next) return;
      draft.foundations.imageProfiles[imageIndex] = { ...next, ...patch };
    });
  };

  const handleImageUpload = async (imageIndex: number, file: File | null) => {
    if (!file) return;
    try {
      const dataUrl = await fileToDataUrl(file);
      if (!dataUrl) return;
      upsertImage(imageIndex, { placeholder: dataUrl });
    } catch {
      // ignore failed uploads and keep current value
    }
  };

  const usedFamilies = (() => {
    const set = new Set<string>();
    const pairings = activeScenario?.palette.pairings;
    if (!pairings) return [];
    if (pairings.primaryPrimitive) {
      const family = parsePrimitiveFamily(pairings.primaryPrimitive);
      if (family) set.add(family);
    }
    for (const id of pairings.accentPrimitives || []) {
      const family = parsePrimitiveFamily(id);
      if (family) set.add(family);
    }
    for (const id of pairings.neutralPrimitives || []) {
      const family = parsePrimitiveFamily(id);
      if (family) set.add(family);
    }
    for (const id of Object.values(pairings.semanticPrimitives || {})) {
      const family = parsePrimitiveFamily(String(id || ''));
      if (family) set.add(family);
    }
    return Array.from(set);
  })();

  return (
    <div className="vds-controls">
      <details className="vds-controls__section vds-collapsible" open>
        <summary>Foundations</summary>
        <div className="vds-section-body">
          <label className="vds-field">
            <span>Scenario</span>
            <div className="vds-row">
              <select
                value={value.activeScenarioId}
                onChange={(e) => {
                  const next = e.target.value;
                  commit((draft) => {
                    draft.activeScenarioId = next;
                  });
                }}
              >
                {value.scenarios.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="mac-btn h-8"
                onClick={() => {
                  commit((draft) => {
                    const id = `scenario-${draft.scenarios.length + 1}`;
                    draft.scenarios.push({
                      id,
                      name: `Scenario ${draft.scenarios.length + 1}`,
                      palette: {
                        primary: activeScenario?.palette.primary || '#2563eb',
                        accent: (activeScenario?.palette.accent || ['#7c3aed', '#f97316', '#14b8a6']).slice(0, 4),
                        neutral: (activeScenario?.palette.neutral || ['#f8fafc', '#e2e8f0', '#64748b', '#0f172a']).slice(0, 5),
                        semantic: {
                          ...(activeScenario?.palette.semantic || {
                            success: '#16a34a',
                            warning: '#d97706',
                            error: '#dc2626',
                            info: '#2563eb',
                          }),
                        },
                        pairings: {
                          primaryPrimitive: activeScenario?.palette.pairings?.primaryPrimitive || 'blue-600',
                          accentPrimitives: activeScenario?.palette.pairings?.accentPrimitives || ['violet-600', 'orange-500'],
                          neutralPrimitives: activeScenario?.palette.pairings?.neutralPrimitives || ['slate-50', 'slate-200', 'slate-700'],
                          semanticPrimitives: activeScenario?.palette.pairings?.semanticPrimitives || {},
                          primitiveOverrides: activeScenario?.palette.pairings?.primitiveOverrides || {},
                        },
                      },
                      ratios: [
                        {
                          scope: 'ui',
                          neutralPct: 74,
                          primaryPct: 16,
                          accentPct: 10,
                          semanticPct: 0,
                          primitiveBreakdown: [
                            { id: 'neutral-base', primitiveId: 'slate-100', pct: 52, usage: 'surface' },
                            { id: 'neutral-strong', primitiveId: 'slate-700', pct: 22, usage: 'surface' },
                            { id: 'primary', primitiveId: 'primary', pct: 16, usage: 'item' },
                            { id: 'accent-1', primitiveId: 'violet-600', pct: 10, usage: 'item' },
                          ],
                        },
                      ],
                    });
                    draft.activeScenarioId = id;
                  });
                }}
              >
                Add
              </button>
              <button
                type="button"
                className="mac-btn h-8"
                disabled={value.scenarios.length <= 1}
                onClick={() => {
                  commit((draft) => {
                    if (draft.scenarios.length <= 1) return;
                    const idx = Math.max(0, draft.scenarios.findIndex((s) => s.id === draft.activeScenarioId));
                    draft.scenarios.splice(idx, 1);
                    draft.activeScenarioId = draft.scenarios[Math.max(0, idx - 1)]?.id || draft.scenarios[0]?.id || 'base';
                  });
                }}
              >
                Remove
              </button>
            </div>
          </label>

          <label className="vds-field">
            <span>Google font family</span>
            <div className="vds-row">
              <select
                value={selectedFont}
                onChange={(e) => {
                  const next = e.target.value;
                  commit((draft) => {
                    if (next === 'custom') return;
                    const font = VISION_GOOGLE_FONT_OPTIONS.find((f) => f.id === next);
                    if (!font) return;
                    draft.foundations.fontFamily = font.family;
                  });
                }}
              >
                {VISION_GOOGLE_FONT_OPTIONS.map((f) => (
                  <option key={f.id} value={f.id} style={{ fontFamily: f.family }}>
                    {f.label}
                  </option>
                ))}
                <option value="custom">Custom</option>
              </select>
              <input
                type="text"
                value={value.foundations.fontFamily}
                onChange={(e) =>
                  commit((draft) => {
                    draft.foundations.fontFamily = e.target.value;
                  })
                }
                placeholder="Font family stack"
              />
            </div>
            <div className="vds-font-picker-preview" style={{ fontFamily: value.foundations.fontFamily }}>
              Preview: Adaptive hierarchy across labels, body, and titles.
            </div>
          </label>

          <div className="vds-subheading">Image profiles</div>
          <div className="vds-stack">
            {value.foundations.imageProfiles.map((img, idx) => (
              <div key={img.id} className="vds-card">
                <div className="vds-grid vds-grid--2">
                  <label className="vds-field">
                    <span>Name</span>
                    <input type="text" value={img.name} onChange={(e) => upsertImage(idx, { name: e.target.value })} />
                  </label>
                  <label className="vds-field">
                    <span>Style</span>
                    <input type="text" value={img.style} onChange={(e) => upsertImage(idx, { style: e.target.value })} />
                  </label>
                  <label className="vds-field">
                    <span>Lighting</span>
                    <input type="text" value={img.lighting} onChange={(e) => upsertImage(idx, { lighting: e.target.value })} />
                  </label>
                  <label className="vds-field">
                    <span>Line weight</span>
                    <input type="text" value={img.lineWeight} onChange={(e) => upsertImage(idx, { lineWeight: e.target.value })} />
                  </label>
                </div>
                <label className="vds-field">
                  <span>Placeholder image URL</span>
                  <input type="text" value={img.placeholder} onChange={(e) => upsertImage(idx, { placeholder: e.target.value })} />
                </label>
                <label className="vds-field">
                  <span>Upload placeholder image</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0] || null;
                      void handleImageUpload(idx, file);
                      e.currentTarget.value = '';
                    }}
                  />
                </label>
                <label className="vds-field">
                  <span>Notes</span>
                  <textarea value={img.notes} rows={2} onChange={(e) => upsertImage(idx, { notes: e.target.value })} />
                </label>
                <button
                  type="button"
                  className="mac-btn h-8"
                  disabled={value.foundations.imageProfiles.length <= 1}
                  onClick={() =>
                    commit((draft) => {
                      if (draft.foundations.imageProfiles.length <= 1) return;
                      draft.foundations.imageProfiles.splice(idx, 1);
                    })
                  }
                >
                  Remove profile
                </button>
              </div>
            ))}
          </div>
        </div>
      </details>

      <details className="vds-controls__section vds-collapsible">
        <summary>Color System</summary>
        <div className="vds-section-body">
          <p className="vds-help">
            Primitive-first colors. Ratios describe primitive usage by scope, then variance/saturation/bleed derive the live palette behavior.
          </p>

          <label className="vds-field">
            <span>Primary primitive</span>
            <div className="vds-row">
              <select
                value={activeScenario?.palette.pairings?.primaryPrimitive || 'blue-600'}
                onChange={(e) =>
                  commit((draft) => {
                    withActiveScenario(draft, (scenario) => {
                      ensurePairings(scenario);
                      scenario.palette.pairings!.primaryPrimitive = e.target.value;
                    });
                  })
                }
              >
                {ACCENT_PRIMITIVES.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.name}
                  </option>
                ))}
              </select>
              <PrimitiveBadge value={activeScenario?.palette.pairings?.primaryPrimitive} />
            </div>
          </label>

          <details className="vds-mini-collapse" open>
            <summary>Primitive Pairings</summary>
            <div className="vds-stack">
              <label className="vds-field">
                <span>Accent primitives</span>
                <div className="vds-stack">
                  {(activeScenario?.palette.pairings?.accentPrimitives || []).map((id, idx) => (
                    <div key={`${id}-${idx}`} className="vds-row">
                      <select
                        value={id}
                        onChange={(e) =>
                          commit((draft) => {
                            withActiveScenario(draft, (scenario) => {
                              ensurePairings(scenario);
                              scenario.palette.pairings!.accentPrimitives![idx] = e.target.value;
                            });
                          })
                        }
                      >
                        {ACCENT_PRIMITIVES.map((opt) => (
                          <option key={opt.id} value={opt.id}>
                            {opt.name}
                          </option>
                        ))}
                      </select>
                      <PrimitiveBadge value={id} />
                      <button
                        type="button"
                        className="mac-btn h-8"
                        onClick={() =>
                          commit((draft) => {
                            withActiveScenario(draft, (scenario) => {
                              ensurePairings(scenario);
                              scenario.palette.pairings!.accentPrimitives!.splice(idx, 1);
                            });
                          })
                        }
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="mac-btn h-8"
                    onClick={() =>
                      commit((draft) => {
                        withActiveScenario(draft, (scenario) => {
                          ensurePairings(scenario);
                          scenario.palette.pairings!.accentPrimitives!.push('violet-600');
                        });
                      })
                    }
                  >
                    Add accent primitive
                  </button>
                </div>
              </label>

              <label className="vds-field">
                <span>Neutral primitives</span>
                <div className="vds-stack">
                  {(activeScenario?.palette.pairings?.neutralPrimitives || []).map((id, idx) => (
                    <div key={`${id}-${idx}`} className="vds-row">
                      <select
                        value={id}
                        onChange={(e) =>
                          commit((draft) => {
                            withActiveScenario(draft, (scenario) => {
                              ensurePairings(scenario);
                              scenario.palette.pairings!.neutralPrimitives![idx] = e.target.value;
                            });
                          })
                        }
                      >
                        {NEUTRAL_PRIMITIVES.map((opt) => (
                          <option key={opt.id} value={opt.id}>
                            {opt.name}
                          </option>
                        ))}
                      </select>
                      <PrimitiveBadge value={id} />
                      <button
                        type="button"
                        className="mac-btn h-8"
                        onClick={() =>
                          commit((draft) => {
                            withActiveScenario(draft, (scenario) => {
                              ensurePairings(scenario);
                              scenario.palette.pairings!.neutralPrimitives!.splice(idx, 1);
                            });
                          })
                        }
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="mac-btn h-8"
                    onClick={() =>
                      commit((draft) => {
                        withActiveScenario(draft, (scenario) => {
                          ensurePairings(scenario);
                          scenario.palette.pairings!.neutralPrimitives!.push('slate-200');
                        });
                      })
                    }
                  >
                    Add neutral primitive
                  </button>
                </div>
              </label>

              <details className="vds-mini-collapse">
                <summary>Semantic Pairings (Optional)</summary>
                <div className="vds-stack">
                  {SEMANTIC_KEYS.map((key) => (
                    <label key={key} className="vds-field">
                      <span>{key}</span>
                      <div className="vds-row">
                        <select
                          value={activeScenario?.palette.pairings?.semanticPrimitives?.[key] || ''}
                          onChange={(e) =>
                            commit((draft) => {
                              withActiveScenario(draft, (scenario) => {
                                ensurePairings(scenario);
                                if (!e.target.value) {
                                  delete scenario.palette.pairings!.semanticPrimitives![key];
                                } else {
                                  scenario.palette.pairings!.semanticPrimitives![key] = e.target.value;
                                }
                              });
                            })
                          }
                        >
                          <option value="">None</option>
                          {ACCENT_PRIMITIVES.map((opt) => (
                            <option key={opt.id} value={opt.id}>
                              {opt.name}
                            </option>
                          ))}
                        </select>
                        <PrimitiveBadge value={activeScenario?.palette.pairings?.semanticPrimitives?.[key]} />
                      </div>
                    </label>
                  ))}
                </div>
              </details>
            </div>
          </details>

          <details className="vds-mini-collapse">
            <summary>Primitive Family Overrides</summary>
            <div className="vds-stack">
              {usedFamilies.length ? (
                usedFamilies.map((family) => {
                  const current = activeScenario?.palette.pairings?.primitiveOverrides?.[family] || '#2563eb';
                  return (
                    <label key={family} className="vds-field">
                      <span>{family}</span>
                      <div className="vds-row">
                        <input
                          type="color"
                          value={current}
                          onChange={(e) =>
                            commit((draft) => {
                              withActiveScenario(draft, (scenario) => {
                                ensurePairings(scenario);
                                scenario.palette.pairings!.primitiveOverrides![family] = normalizeHexLoose(
                                  e.target.value,
                                  scenario.palette.pairings!.primitiveOverrides![family] || '#2563eb',
                                );
                              });
                            })
                          }
                        />
                        <input
                          type="text"
                          value={current}
                          onChange={(e) =>
                            commit((draft) => {
                              withActiveScenario(draft, (scenario) => {
                                ensurePairings(scenario);
                                scenario.palette.pairings!.primitiveOverrides![family] = normalizeHexLoose(
                                  e.target.value,
                                  scenario.palette.pairings!.primitiveOverrides![family] || '#2563eb',
                                );
                              });
                            })
                          }
                        />
                      </div>
                    </label>
                  );
                })
              ) : (
                <div className="vds-help">No primitive families selected yet.</div>
              )}
            </div>
          </details>

          <details className="vds-mini-collapse">
            <summary>Primitive Ratio By Scope</summary>
            <div className="vds-stack">
              <p className="vds-help">Percentage of primitive usage per scope. This controls how many colors variance can actually use.</p>
              {(activeScenario?.ratios || []).map((row, idx) => {
                const entries = ratioEntries(row);
                const total = ratioTotal(entries);
                return (
                  <div key={`${row.scope}-${idx}`} className="vds-ratio-card">
                    <div className="vds-ratio-header">
                      <select
                        value={row.scope}
                        onChange={(e) =>
                          commit((draft) => {
                            withActiveScenario(draft, (scenario) => {
                              const current = scenario.ratios[idx];
                              if (!current) return;
                              current.scope = e.target.value as VisionColorRatioV1['scope'];
                            });
                          })
                        }
                      >
                        <option value="ui">ui</option>
                        <option value="icons">icons</option>
                        <option value="images">images</option>
                        <option value="all">all</option>
                      </select>
                      <span className={['vds-ratio-total', total === 100 ? 'is-ok' : 'is-warning'].join(' ')}>Total: {total}%</span>
                      <button
                        type="button"
                        className="mac-btn h-8"
                        onClick={() => {
                          setRatioEntries(idx, normalizeRatioEntries(entries));
                        }}
                      >
                        Normalize
                      </button>
                      <button
                        type="button"
                        className="mac-btn h-8"
                        disabled={(activeScenario?.ratios || []).length <= 1}
                        onClick={() =>
                          commit((draft) => {
                            withActiveScenario(draft, (scenario) => {
                              if (scenario.ratios.length <= 1) return;
                              scenario.ratios.splice(idx, 1);
                            });
                          })
                        }
                      >
                        Remove
                      </button>
                    </div>

                    <div className="vds-stack">
                      {entries.map((entry, entryIdx) => (
                        <div key={entry.id} className="vds-ratio-entry-row">
                          <select
                            value={entry.primitiveId}
                            onChange={(e) => {
                              const nextEntries = entries.slice();
                              nextEntries[entryIdx] = { ...nextEntries[entryIdx], primitiveId: e.target.value };
                              setRatioEntries(idx, nextEntries);
                            }}
                          >
                            <option value="primary">primary</option>
                            {ALL_PRIMITIVES.map((opt) => (
                              <option key={opt.id} value={opt.id}>
                                {opt.name}
                              </option>
                            ))}
                          </select>
                          <select
                            value={entry.usage || 'item'}
                            onChange={(e) => {
                              const nextEntries = entries.slice();
                              nextEntries[entryIdx] = {
                                ...nextEntries[entryIdx],
                                usage: e.target.value as VisionPrimitiveRatioEntryV1['usage'],
                              };
                              setRatioEntries(idx, nextEntries);
                            }}
                          >
                            <option value="surface">surface</option>
                            <option value="item">item</option>
                            <option value="all">all</option>
                          </select>
                          <input
                            type="number"
                            min={0}
                            max={100}
                            value={entry.pct}
                            onChange={(e) => {
                              const nextEntries = entries.slice();
                              nextEntries[entryIdx] = { ...nextEntries[entryIdx], pct: clamp(Number(e.target.value), 0, 100) };
                              setRatioEntries(idx, nextEntries);
                            }}
                          />
                          <button
                            type="button"
                            className="mac-btn h-8"
                            disabled={entries.length <= 1}
                            onClick={() => {
                              const nextEntries = entries.slice();
                              nextEntries.splice(entryIdx, 1);
                              setRatioEntries(idx, nextEntries);
                            }}
                          >
                            -
                          </button>
                        </div>
                      ))}
                    </div>
                    <button
                      type="button"
                      className="mac-btn h-8"
                      onClick={() => {
                        const nextEntries = entries.concat({
                          id: `entry-${Date.now()}-${entries.length + 1}`,
                          primitiveId: 'primary',
                          pct: 10,
                          usage: 'item',
                        });
                        setRatioEntries(idx, nextEntries);
                      }}
                    >
                      Add primitive split
                    </button>

                    <div className="vds-ratio-bar">
                      {entries.map((entry) => {
                        const primitive = entry.primitiveId === 'primary' ? null : findPrimitive(entry.primitiveId);
                        const bg = entry.primitiveId === 'primary' ? '#2563eb' : primitive?.hex || '#94a3b8';
                        return <span key={`${entry.id}-bar`} style={{ width: `${entry.pct}%`, background: bg }} />;
                      })}
                    </div>
                  </div>
                );
              })}
              <button
                type="button"
                className="mac-btn h-8"
                onClick={() =>
                  commit((draft) => {
                    withActiveScenario(draft, (scenario) => {
                      scenario.ratios.push({
                        scope: 'ui',
                        neutralPct: 72,
                        primaryPct: 18,
                        accentPct: 10,
                        semanticPct: 0,
                        primitiveBreakdown: [
                          { id: 'neutral-base', primitiveId: 'slate-100', pct: 52, usage: 'surface' },
                          { id: 'neutral-strong', primitiveId: 'slate-700', pct: 20, usage: 'surface' },
                          { id: 'primary', primitiveId: 'primary', pct: 18, usage: 'item' },
                          { id: 'accent-1', primitiveId: 'violet-600', pct: 10, usage: 'item' },
                        ],
                      });
                    });
                  })
                }
              >
                Add ratio row
              </button>
            </div>
          </details>

          <SliderRow
            label="Surface saturation"
            helper="Moves surface wells from white/gray toward light-to-solid color."
            value={value.controls.surfaceSaturation}
            onChange={(next) => commit((draft) => (draft.controls.surfaceSaturation = clamp(Math.round(next), 0, 100)))}
          />
          <SliderRow
            label="Item saturation"
            helper="Interactive items/icons/charts saturation intensity."
            value={value.controls.itemSaturation}
            onChange={(next) => commit((draft) => (draft.controls.itemSaturation = clamp(Math.round(next), 0, 100)))}
          />
          <SliderRow
            label="Color variance"
            helper="How many primitive colors become active across lists, tables, tags, and status visuals."
            value={value.controls.colorVariance}
            onChange={(next) => commit((draft) => (draft.controls.colorVariance = clamp(Math.round(next), 0, 100)))}
          />
          <SliderRow
            label="Color bleed (surface)"
            helper="Bleed amount into non-highlighted surfaces. At 0 neutral surfaces stay fully neutral."
            value={value.controls.colorBleed}
            onChange={(next) => commit((draft) => (draft.controls.colorBleed = clamp(Math.round(next), 0, 100)))}
          />
          <SliderRow
            label="Color bleed (text)"
            helper="How much text neutrals tint toward bleed hue for cohesive colored zones."
            value={value.controls.colorBleedText}
            onChange={(next) => commit((draft) => (draft.controls.colorBleedText = clamp(Math.round(next), 0, 100)))}
          />

          <label className="vds-field">
            <span>Bleed hue source</span>
            <select
              value={value.controls.colorBleedTone}
              onChange={(e) =>
                commit((draft) => {
                  draft.controls.colorBleedTone = e.target.value as VisionDesignSystemV1['controls']['colorBleedTone'];
                })
              }
            >
              <option value="primary">primary</option>
              <option value="accent">accent</option>
              <option value="warm">warm</option>
              <option value="cool">cool</option>
              <option value="custom">custom</option>
            </select>
          </label>

          {value.controls.colorBleedTone === 'custom' ? (
            <label className="vds-field">
              <span>Custom bleed hue</span>
              <div className="vds-row">
                <input
                  type="color"
                  value={value.controls.colorBleedCustom}
                  onChange={(e) =>
                    commit((draft) => {
                      draft.controls.colorBleedCustom = normalizeHexLoose(e.target.value, draft.controls.colorBleedCustom || '#2563eb');
                    })
                  }
                />
                <input
                  type="text"
                  value={value.controls.colorBleedCustom}
                  onChange={(e) =>
                    commit((draft) => {
                      draft.controls.colorBleedCustom = normalizeHexLoose(e.target.value, draft.controls.colorBleedCustom || '#2563eb');
                    })
                  }
                />
              </div>
            </label>
          ) : null}
        </div>
      </details>

      <details className="vds-controls__section vds-collapsible">
        <summary>Typography</summary>
        <div className="vds-section-body">
          <label className="vds-field">
            <span>Font variance mode</span>
            <select
              value={value.controls.fontVariance}
              onChange={(e) =>
                commit((draft) => {
                  draft.controls.fontVariance = e.target.value as typeof value.controls.fontVariance;
                })
              }
            >
              {FONT_VARIANCE_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
            <div className="vds-help">{FONT_VARIANCE_OPTIONS.find((opt) => opt.id === value.controls.fontVariance)?.description}</div>
          </label>
          <SliderRow
            label="Typography base size"
            helper="Sets body baseline before scale expansion/compression."
            value={value.controls.typography.baseSizePx}
            min={12}
            max={24}
            onChange={(next) =>
              commit((draft) => {
                draft.controls.typography.baseSizePx = clamp(Math.round(next), 12, 24);
              })
            }
          />
          <SliderRow
            label="Typography base weight"
            helper="Controls base weight for body and UI labels."
            value={value.controls.typography.baseWeight}
            min={300}
            max={700}
            step={50}
            onChange={(next) =>
              commit((draft) => {
                draft.controls.typography.baseWeight = clamp(Math.round(next / 50) * 50, 300, 700);
              })
            }
          />
          <SliderRow
            label="Typography size growth"
            helper="Affects full type scale including smaller labels/captions."
            value={value.controls.typography.sizeGrowth}
            onChange={(next) =>
              commit((draft) => {
                draft.controls.typography.sizeGrowth = clamp(Math.round(next), 0, 100);
              })
            }
          />
          <SliderRow
            label="Typography weight growth"
            helper="Controls spread from light body text to heavy headings."
            value={value.controls.typography.weightGrowth}
            onChange={(next) =>
              commit((draft) => {
                draft.controls.typography.weightGrowth = clamp(Math.round(next), 0, 100);
              })
            }
          />
          <SliderRow
            label="Typography contrast"
            helper="Controls opacity/emphasis contrast across text hierarchy."
            value={value.controls.typography.contrast}
            onChange={(next) =>
              commit((draft) => {
                draft.controls.typography.contrast = clamp(Math.round(next), 0, 100);
              })
            }
          />
        </div>
      </details>

      <details className="vds-controls__section vds-collapsible">
        <summary>Spacing</summary>
        <div className="vds-section-body">
          <SliderRow
            label="Spacing pattern"
            helper="Rhythm ladder pattern: compact geometric vs coarse powers-of-two."
            value={value.controls.spacing.pattern}
            onChange={(next) =>
              commit((draft) => {
                draft.controls.spacing.pattern = clamp(Math.round(next), 0, 100);
              })
            }
          />
          <SliderRow
            label="Spacing density"
            helper="Global compactness/spaciousness across all components."
            value={value.controls.spacing.density}
            onChange={(next) =>
              commit((draft) => {
                draft.controls.spacing.density = clamp(Math.round(next), 0, 100);
              })
            }
          />
          <SliderRow
            label="Around vs inside spacing"
            helper="Outer shell breathing room versus intra-component gaps."
            value={value.controls.spacing.aroundVsInside}
            onChange={(next) =>
              commit((draft) => {
                draft.controls.spacing.aroundVsInside = clamp(Math.round(next), 0, 100);
              })
            }
          />
        </div>
      </details>

      <details className="vds-controls__section vds-collapsible">
        <summary>Structure and Material</summary>
        <div className="vds-section-body">
          <SliderRow
            label="Flatness"
            helper="From line separators to card-heavy segmentation and depth."
            value={value.controls.flatness}
            onChange={(next) => commit((draft) => (draft.controls.flatness = clamp(Math.round(next), 0, 100)))}
          />
          <SliderRow
            label="Zoning"
            helper="From minimal zones to strong multi-zone hierarchy."
            value={value.controls.zoning}
            onChange={(next) => commit((draft) => (draft.controls.zoning = clamp(Math.round(next), 0, 100)))}
          />
          <SliderRow
            label="Softness"
            helper="Controls non-uniform radius ladder across component families."
            value={value.controls.softness}
            onChange={(next) => commit((draft) => (draft.controls.softness = clamp(Math.round(next), 0, 100)))}
          />
          <SliderRow
            label="Wireframe feeling"
            helper="From barely-there borders to thick structural lines/dashes."
            value={value.controls.wireframeFeeling}
            onChange={(next) => commit((draft) => (draft.controls.wireframeFeeling = clamp(Math.round(next), 0, 100)))}
          />
          <SliderRow
            label="Visual range"
            helper="From flat colors to richer gradients and expressive effects."
            value={value.controls.visualRange}
            onChange={(next) => commit((draft) => (draft.controls.visualRange = clamp(Math.round(next), 0, 100)))}
          />
          <label className="vds-field">
            <span>Skeuomorphism style</span>
            <select
              value={value.controls.skeuomorphismStyle}
              onChange={(e) =>
                commit((draft) => {
                  draft.controls.skeuomorphismStyle = e.target.value as VisionDesignSystemV1['controls']['skeuomorphismStyle'];
                })
              }
            >
              <option value="subtle">subtle material</option>
              <option value="neomorphic">neomorphic</option>
              <option value="glass">glass / frosted</option>
              <option value="glow">glow / ambient</option>
              <option value="embossed">embossed</option>
            </select>
          </label>
          <SliderRow
            label="Skeuomorphism intensity"
            helper="Strength of highlights, shadows, and physical affordances."
            value={value.controls.skeuomorphism}
            onChange={(next) => commit((draft) => (draft.controls.skeuomorphism = clamp(Math.round(next), 0, 100)))}
          />
          <SliderRow
            label="Negative zone style"
            helper="Background treatment for negative zones: flat, gradient, texture, image-like."
            value={value.controls.negativeZoneStyle}
            onChange={(next) => commit((draft) => (draft.controls.negativeZoneStyle = clamp(Math.round(next), 0, 100)))}
          />
          <SliderRow
            label="Boldness"
            helper="Persistent edge-zone brand/media coverage intensity."
            value={value.controls.boldness}
            onChange={(next) => commit((draft) => (draft.controls.boldness = clamp(Math.round(next), 0, 100)))}
          />
        </div>
      </details>
    </div>
  );
}
