'use client';

import {
  deriveDesignSystemTokens,
  normalizeVisionDesignSystem,
  VISION_GOOGLE_FONT_OPTIONS,
  VISION_TAILWIND_PRIMITIVE_COLORS,
  type VisionColorRatioV1,
  type VisionDesignSystemV1,
  type VisionImageProfileV1,
  type VisionPrimitiveColorOption,
  type VisionSemanticPaletteV1,
} from '@/lib/vision-design-system';

type Props = {
  value: VisionDesignSystemV1;
  onChange: (next: VisionDesignSystemV1) => void;
};

const NEUTRAL_PRIMITIVES = VISION_TAILWIND_PRIMITIVE_COLORS.filter((c) => c.kind === 'neutral');
const ACCENT_PRIMITIVES = VISION_TAILWIND_PRIMITIVE_COLORS.filter((c) => c.kind === 'accent');
const SEMANTIC_KEYS: Array<keyof VisionSemanticPaletteV1> = ['success', 'warning', 'error', 'info'];

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
    reader.onload = () => {
      resolve(typeof reader.result === 'string' ? reader.result : '');
    };
    reader.onerror = () => reject(reader.error || new Error('Failed to read file.'));
    reader.readAsDataURL(file);
  });
}

function findPrimitive(id: string): VisionPrimitiveColorOption | null {
  const key = String(id || '').trim();
  if (!key) return null;
  return VISION_TAILWIND_PRIMITIVE_COLORS.find((it) => it.id === key) || null;
}

function ratioTotal(row: VisionColorRatioV1): number {
  return Number(row.neutralPct || 0) + Number(row.primaryPct || 0) + Number(row.accentPct || 0) + Number(row.semanticPct || 0);
}

function normalizeRatioRow(row: VisionColorRatioV1): VisionColorRatioV1 {
  const total = ratioTotal(row);
  if (total === 100) return row;
  if (total <= 0) {
    return { ...row, neutralPct: 74, primaryPct: 16, accentPct: 6, semanticPct: 4 };
  }
  const f = 100 / total;
  const neutralPct = clamp(Math.round(row.neutralPct * f), 0, 100);
  const primaryPct = clamp(Math.round(row.primaryPct * f), 0, 100);
  const accentPct = clamp(Math.round(row.accentPct * f), 0, 100);
  let semanticPct = clamp(Math.round(row.semanticPct * f), 0, 100);
  const diff = 100 - (neutralPct + primaryPct + accentPct + semanticPct);
  semanticPct = clamp(semanticPct + diff, 0, 100);
  return { ...row, neutralPct, primaryPct, accentPct, semanticPct };
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
    draft.derived = deriveDesignSystemTokens(draft);
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
      scenario.palette.pairings = { accentPrimitives: [], neutralPrimitives: [], semanticPrimitives: {} };
    }
    if (!scenario.palette.pairings.accentPrimitives) scenario.palette.pairings.accentPrimitives = [];
    if (!scenario.palette.pairings.neutralPrimitives) scenario.palette.pairings.neutralPrimitives = [];
    if (!scenario.palette.pairings.semanticPrimitives) scenario.palette.pairings.semanticPrimitives = {};
  };

  const setPalettePrimitive = (kind: 'accent' | 'neutral', idx: number, primitiveId: string) => {
    commit((draft) => {
      withActiveScenario(draft, (scenario) => {
        ensurePairings(scenario);
        const primitive = findPrimitive(primitiveId);
        if (!primitive) return;
        const list = kind === 'accent' ? scenario.palette.accent : scenario.palette.neutral;
        const pairings = kind === 'accent' ? scenario.palette.pairings!.accentPrimitives! : scenario.palette.pairings!.neutralPrimitives!;
        while (list.length <= idx) list.push(kind === 'accent' ? '#3b82f6' : '#e2e8f0');
        while (pairings.length <= idx) pairings.push('');
        list[idx] = primitive.hex;
        pairings[idx] = primitive.id;
      });
    });
  };

  const setPaletteColor = (kind: 'accent' | 'neutral', idx: number, color: string) => {
    commit((draft) => {
      withActiveScenario(draft, (scenario) => {
        ensurePairings(scenario);
        const list = kind === 'accent' ? scenario.palette.accent : scenario.palette.neutral;
        while (list.length <= idx) list.push(kind === 'accent' ? '#3b82f6' : '#e2e8f0');
        list[idx] = normalizeHexLoose(color, list[idx] || (kind === 'accent' ? '#3b82f6' : '#e2e8f0'));
      });
    });
  };

  const setSemanticPrimitive = (key: keyof VisionSemanticPaletteV1, primitiveId: string) => {
    commit((draft) => {
      withActiveScenario(draft, (scenario) => {
        ensurePairings(scenario);
        const primitive = findPrimitive(primitiveId);
        if (!primitive) return;
        scenario.palette.semantic[key] = primitive.hex;
        scenario.palette.pairings!.semanticPrimitives![key] = primitive.id;
      });
    });
  };

  const setSemanticColor = (key: keyof VisionSemanticPaletteV1, color: string) => {
    commit((draft) => {
      withActiveScenario(draft, (scenario) => {
        scenario.palette.semantic[key] = normalizeHexLoose(color, scenario.palette.semantic[key]);
      });
    });
  };

  const upsertRatio = (rowIndex: number, patch: Partial<VisionColorRatioV1>) => {
    commit((draft) => {
      withActiveScenario(draft, (scenario) => {
        const row = scenario.ratios[rowIndex] || scenario.ratios[0];
        if (!row) return;
        scenario.ratios[rowIndex] = {
          ...row,
          ...patch,
          neutralPct: clamp(Number((patch.neutralPct ?? row.neutralPct) || 0), 0, 100),
          primaryPct: clamp(Number((patch.primaryPct ?? row.primaryPct) || 0), 0, 100),
          accentPct: clamp(Number((patch.accentPct ?? row.accentPct) || 0), 0, 100),
          semanticPct: clamp(Number((patch.semanticPct ?? row.semanticPct) || 0), 0, 100),
        };
      });
    });
  };

  const normalizeRatio = (rowIndex: number) => {
    commit((draft) => {
      withActiveScenario(draft, (scenario) => {
        const row = scenario.ratios[rowIndex];
        if (!row) return;
        scenario.ratios[rowIndex] = normalizeRatioRow(row);
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
                          accentPrimitives: activeScenario?.palette.pairings?.accentPrimitives || [],
                          neutralPrimitives: activeScenario?.palette.pairings?.neutralPrimitives || [],
                          semanticPrimitives: activeScenario?.palette.pairings?.semanticPrimitives || {},
                        },
                      },
                      ratios: [{ scope: 'ui', neutralPct: 74, primaryPct: 16, accentPct: 6, semanticPct: 4 }],
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
                  <option key={f.id} value={f.id}>
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
            <button
              type="button"
              className="mac-btn h-8"
              onClick={() =>
                commit((draft) => {
                  draft.foundations.imageProfiles.push({
                    id: `image-profile-${draft.foundations.imageProfiles.length + 1}`,
                    name: `Image profile ${draft.foundations.imageProfiles.length + 1}`,
                    style: 'Stylized illustration',
                    lighting: 'Soft ambient light',
                    lineWeight: 'Medium',
                    notes: '',
                    placeholder: '',
                  });
                })
              }
            >
              Add image profile
            </button>
          </div>
        </div>
      </details>

      <details className="vds-controls__section vds-collapsible" open>
        <summary>Color System</summary>
        <div className="vds-section-body">
          <label className="vds-field">
            <span>Primary color</span>
            <div className="vds-row">
              <input
                type="color"
                value={activeScenario?.palette.primary || '#2563eb'}
                onChange={(e) =>
                  commit((draft) => {
                    withActiveScenario(draft, (scenario) => {
                      scenario.palette.primary = normalizeHexLoose(e.target.value, '#2563eb');
                    });
                  })
                }
              />
              <input
                type="text"
                value={activeScenario?.palette.primary || ''}
                onChange={(e) =>
                  commit((draft) => {
                    withActiveScenario(draft, (scenario) => {
                      scenario.palette.primary = normalizeHexLoose(e.target.value, scenario.palette.primary || '#2563eb');
                    });
                  })
                }
              />
            </div>
          </label>

          <div className="vds-subheading">Accent primitives (influences color variance)</div>
          <div className="vds-color-slot-grid">
            {Array.from({ length: 4 }).map((_, idx) => {
              const color = activeScenario?.palette.accent[idx] || '#3b82f6';
              const primitiveId = activeScenario?.palette.pairings?.accentPrimitives?.[idx] || '';
              return (
                <div key={`accent-${idx}`} className="vds-color-slot">
                  <div className="vds-color-slot__head">
                    <strong>Accent {idx + 1}</strong>
                    <span className="vds-color-swatch" style={{ background: color }} />
                  </div>
                  <div className="vds-row">
                    <input type="color" value={color} onChange={(e) => setPaletteColor('accent', idx, e.target.value)} />
                    <input type="text" value={color} onChange={(e) => setPaletteColor('accent', idx, e.target.value)} />
                  </div>
                  <select value={primitiveId} onChange={(e) => setPalettePrimitive('accent', idx, e.target.value)}>
                    <option value="">Custom color</option>
                    {ACCENT_PRIMITIVES.map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {opt.name}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>

          <div className="vds-subheading">Neutral primitives</div>
          <div className="vds-color-slot-grid">
            {Array.from({ length: 5 }).map((_, idx) => {
              const color = activeScenario?.palette.neutral[idx] || (idx < 2 ? '#f8fafc' : idx < 4 ? '#94a3b8' : '#0f172a');
              const primitiveId = activeScenario?.palette.pairings?.neutralPrimitives?.[idx] || '';
              return (
                <div key={`neutral-${idx}`} className="vds-color-slot">
                  <div className="vds-color-slot__head">
                    <strong>Neutral {idx + 1}</strong>
                    <span className="vds-color-swatch" style={{ background: color }} />
                  </div>
                  <div className="vds-row">
                    <input type="color" value={color} onChange={(e) => setPaletteColor('neutral', idx, e.target.value)} />
                    <input type="text" value={color} onChange={(e) => setPaletteColor('neutral', idx, e.target.value)} />
                  </div>
                  <select value={primitiveId} onChange={(e) => setPalettePrimitive('neutral', idx, e.target.value)}>
                    <option value="">Custom color</option>
                    {NEUTRAL_PRIMITIVES.map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {opt.name}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>

          <div className="vds-subheading">Semantic pairings</div>
          <div className="vds-color-slot-grid">
            {SEMANTIC_KEYS.map((key) => {
              const color = activeScenario?.palette.semantic[key] || '#2563eb';
              const primitiveId = activeScenario?.palette.pairings?.semanticPrimitives?.[key] || '';
              return (
                <div key={key} className="vds-color-slot">
                  <div className="vds-color-slot__head">
                    <strong>{key}</strong>
                    <span className="vds-color-swatch" style={{ background: color }} />
                  </div>
                  <div className="vds-row">
                    <input type="color" value={color} onChange={(e) => setSemanticColor(key, e.target.value)} />
                    <input type="text" value={color} onChange={(e) => setSemanticColor(key, e.target.value)} />
                  </div>
                  <select value={primitiveId} onChange={(e) => setSemanticPrimitive(key, e.target.value)}>
                    <option value="">Custom color</option>
                    {ACCENT_PRIMITIVES.map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {opt.name}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>

          <div className="vds-subheading">Color ratio by scope</div>
          <p className="vds-help">
            Ratio is percentage share of screen treatment for each scope: neutral vs primary vs accents vs semantic colors.
          </p>
          <div className="vds-stack">
            {(activeScenario?.ratios || []).map((row, idx) => {
              const total = ratioTotal(row);
              return (
                <div key={`${row.scope}-${idx}`} className="vds-ratio-card">
                  <div className="vds-ratio-header">
                    <select value={row.scope} onChange={(e) => upsertRatio(idx, { scope: e.target.value as VisionColorRatioV1['scope'] })}>
                      <option value="ui">ui</option>
                      <option value="icons">icons</option>
                      <option value="images">images</option>
                      <option value="all">all</option>
                    </select>
                    <span className={['vds-ratio-total', total === 100 ? 'is-ok' : 'is-warning'].join(' ')}>Total: {total}%</span>
                    <button type="button" className="mac-btn h-8" onClick={() => normalizeRatio(idx)}>
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
                  <div className="vds-ratio-grid">
                    <label>
                      Neutral
                      <input type="number" min={0} max={100} value={row.neutralPct} onChange={(e) => upsertRatio(idx, { neutralPct: Number(e.target.value) })} />
                    </label>
                    <label>
                      Primary
                      <input type="number" min={0} max={100} value={row.primaryPct} onChange={(e) => upsertRatio(idx, { primaryPct: Number(e.target.value) })} />
                    </label>
                    <label>
                      Accent
                      <input type="number" min={0} max={100} value={row.accentPct} onChange={(e) => upsertRatio(idx, { accentPct: Number(e.target.value) })} />
                    </label>
                    <label>
                      Semantic
                      <input type="number" min={0} max={100} value={row.semanticPct} onChange={(e) => upsertRatio(idx, { semanticPct: Number(e.target.value) })} />
                    </label>
                  </div>
                  <div className="vds-ratio-bar">
                    <span style={{ width: `${row.neutralPct}%` }} className="is-neutral" />
                    <span style={{ width: `${row.primaryPct}%` }} className="is-primary" />
                    <span style={{ width: `${row.accentPct}%` }} className="is-accent" />
                    <span style={{ width: `${row.semanticPct}%` }} className="is-semantic" />
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
                    scenario.ratios.push({ scope: 'ui', neutralPct: 74, primaryPct: 16, accentPct: 6, semanticPct: 4 });
                  });
                })
              }
            >
              Add ratio row
            </button>
          </div>

          <SliderRow
            label="Saturation"
            helper="From mostly white/gray surfaces to broad solid color surfaces."
            value={value.controls.saturation}
            onChange={(next) => commit((draft) => (draft.controls.saturation = clamp(Math.round(next), 0, 100)))}
          />
          <SliderRow
            label="Color variance"
            helper="From single-family color language to multi-accent hue spread."
            value={value.controls.colorVariance}
            onChange={(next) => commit((draft) => (draft.controls.colorVariance = clamp(Math.round(next), 0, 100)))}
          />
          <SliderRow
            label="Color bleed"
            helper="How much neutral surfaces absorb the selected bleed hue."
            value={value.controls.colorBleed}
            onChange={(next) => commit((draft) => (draft.controls.colorBleed = clamp(Math.round(next), 0, 100)))}
          />
          <div className="vds-grid vds-grid--2">
            <label className="vds-field">
              <span>Bleed hue source</span>
              <select
                value={value.controls.colorBleedTone}
                onChange={(e) =>
                  commit((draft) => {
                    const next = String(e.target.value) as VisionDesignSystemV1['controls']['colorBleedTone'];
                    draft.controls.colorBleedTone = next;
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
            <label className="vds-field">
              <span>Custom bleed color</span>
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
          </div>
        </div>
      </details>

      <details className="vds-controls__section vds-collapsible" open>
        <summary>Typography</summary>
        <div className="vds-section-body">
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
            helper="Controls default text heaviness across body and labels."
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
            helper="Changes full type scale including smaller labels/captions, not just headings."
            value={value.controls.typography.sizeGrowth}
            onChange={(next) =>
              commit((draft) => {
                draft.controls.typography.sizeGrowth = clamp(Math.round(next), 0, 100);
              })
            }
          />
          <SliderRow
            label="Typography weight growth"
            helper="Expands contrast between light body text and heavier headings."
            value={value.controls.typography.weightGrowth}
            onChange={(next) =>
              commit((draft) => {
                draft.controls.typography.weightGrowth = clamp(Math.round(next), 0, 100);
              })
            }
          />
        </div>
      </details>

      <details className="vds-controls__section vds-collapsible" open>
        <summary>Spacing</summary>
        <div className="vds-section-body">
          <SliderRow
            label="Spacing pattern"
            helper="Changes the rhythm ladder pattern (e.g. 0,2,4,8... vs 0,4,8,16...)."
            value={value.controls.spacing.pattern}
            onChange={(next) =>
              commit((draft) => {
                draft.controls.spacing.pattern = clamp(Math.round(next), 0, 100);
              })
            }
          />
          <SliderRow
            label="Spacing density"
            helper="Scales all spacing globally from compact to spacious."
            value={value.controls.spacing.density}
            onChange={(next) =>
              commit((draft) => {
                draft.controls.spacing.density = clamp(Math.round(next), 0, 100);
              })
            }
          />
          <SliderRow
            label="Around vs inside spacing"
            helper="Controls outer container breathing room vs inner element spacing."
            value={value.controls.spacing.aroundVsInside}
            onChange={(next) =>
              commit((draft) => {
                draft.controls.spacing.aroundVsInside = clamp(Math.round(next), 0, 100);
              })
            }
          />
        </div>
      </details>

      <details className="vds-controls__section vds-collapsible" open>
        <summary>Structure and Material</summary>
        <div className="vds-section-body">
          <SliderRow
            label="Flatness"
            helper="From separator-heavy flat lists to card-heavy segmented surfaces."
            value={value.controls.flatness}
            onChange={(next) => commit((draft) => (draft.controls.flatness = clamp(Math.round(next), 0, 100)))}
          />
          <SliderRow
            label="Zoning"
            helper="From minimal surface separation to deeper multi-zone hierarchy."
            value={value.controls.zoning}
            onChange={(next) => commit((draft) => (draft.controls.zoning = clamp(Math.round(next), 0, 100)))}
          />
          <SliderRow
            label="Softness"
            helper="Non-uniform radius scale for cards, inputs, tabs, chips, and buttons."
            value={value.controls.softness}
            onChange={(next) => commit((draft) => (draft.controls.softness = clamp(Math.round(next), 0, 100)))}
          />
          <SliderRow
            label="Wireframe feeling"
            helper="From almost invisible boundaries to thicker structural lines and dashes."
            value={value.controls.wireframeFeeling}
            onChange={(next) => commit((draft) => (draft.controls.wireframeFeeling = clamp(Math.round(next), 0, 100)))}
          />
          <SliderRow
            label="Visual range"
            helper="From flat fills to richer gradients/effects while balancing wireframe emphasis."
            value={value.controls.visualRange}
            onChange={(next) => commit((draft) => (draft.controls.visualRange = clamp(Math.round(next), 0, 100)))}
          />
          <SliderRow
            label="Skeuomorphism"
            helper="Adds tactile cues: bevels, gloss, depth, and material lighting behavior."
            value={value.controls.skeuomorphism}
            onChange={(next) => commit((draft) => (draft.controls.skeuomorphism = clamp(Math.round(next), 0, 100)))}
          />
          <SliderRow
            label="Negative zone style"
            helper="Controls whether negative zones stay flat, gradient, textured, or image-like."
            value={value.controls.negativeZoneStyle}
            onChange={(next) => commit((draft) => (draft.controls.negativeZoneStyle = clamp(Math.round(next), 0, 100)))}
          />
          <SliderRow
            label="Boldness"
            helper="Controls persistent edge-zone brand/media coverage without hijacking CTA saliency."
            value={value.controls.boldness}
            onChange={(next) => commit((draft) => (draft.controls.boldness = clamp(Math.round(next), 0, 100)))}
          />
        </div>
      </details>
    </div>
  );
}
