'use client';

import {
  deriveDesignSystemTokens,
  normalizeVisionDesignSystem,
  type VisionColorRatioV1,
  type VisionDesignSystemV1,
  type VisionImageProfileV1,
} from '@/lib/vision-design-system';

type Props = {
  value: VisionDesignSystemV1;
  onChange: (next: VisionDesignSystemV1) => void;
};

function clamp(v: number, min: number, max: number) {
  if (!Number.isFinite(v)) return min;
  if (v < min) return min;
  if (v > max) return max;
  return v;
}

function parseHexList(input: string): string[] {
  return String(input || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
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

function SliderRow({
  label,
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
}: {
  label: string;
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
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

export function DesignSystemControls({ value, onChange }: Props) {
  const activeScenarioIndex = Math.max(0, value.scenarios.findIndex((s) => s.id === value.activeScenarioId));
  const activeScenario = value.scenarios[activeScenarioIndex] || value.scenarios[0];

  const commit = (updater: (draft: VisionDesignSystemV1) => void) => {
    const draft = cloneSpec(value);
    updater(draft);
    draft.updatedAt = new Date().toISOString();
    draft.derived = deriveDesignSystemTokens(draft);
    onChange(normalizeVisionDesignSystem(draft));
  };

  const upsertRatio = (rowIndex: number, patch: Partial<VisionColorRatioV1>) => {
    commit((draft) => {
      const sIndex = Math.max(0, draft.scenarios.findIndex((s) => s.id === draft.activeScenarioId));
      const scenario = draft.scenarios[sIndex] || draft.scenarios[0];
      if (!scenario) return;
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
      <section className="vds-controls__section">
        <h3>Foundations</h3>
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
                      accent: (activeScenario?.palette.accent || ['#7c3aed']).slice(0, 4),
                      neutral: (activeScenario?.palette.neutral || ['#f8fafc']).slice(0, 4),
                      semantic: { ...(activeScenario?.palette.semantic || { success: '#16a34a', warning: '#d97706', error: '#dc2626', info: '#2563eb' }) },
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
          <span>Primary color</span>
          <div className="vds-row">
            <input
              type="color"
              value={activeScenario?.palette.primary || '#2563eb'}
              onChange={(e) =>
                commit((draft) => {
                  const sIndex = Math.max(0, draft.scenarios.findIndex((s) => s.id === draft.activeScenarioId));
                  const scenario = draft.scenarios[sIndex] || draft.scenarios[0];
                  if (!scenario) return;
                  scenario.palette.primary = e.target.value;
                })
              }
            />
            <input
              type="text"
              value={activeScenario?.palette.primary || ''}
              onChange={(e) =>
                commit((draft) => {
                  const sIndex = Math.max(0, draft.scenarios.findIndex((s) => s.id === draft.activeScenarioId));
                  const scenario = draft.scenarios[sIndex] || draft.scenarios[0];
                  if (!scenario) return;
                  scenario.palette.primary = e.target.value;
                })
              }
            />
          </div>
        </label>

        <label className="vds-field">
          <span>Accent palette (comma separated)</span>
          <input
            type="text"
            value={(activeScenario?.palette.accent || []).join(', ')}
            onChange={(e) =>
              commit((draft) => {
                const sIndex = Math.max(0, draft.scenarios.findIndex((s) => s.id === draft.activeScenarioId));
                const scenario = draft.scenarios[sIndex] || draft.scenarios[0];
                if (!scenario) return;
                scenario.palette.accent = parseHexList(e.target.value);
              })
            }
          />
        </label>

        <label className="vds-field">
          <span>Neutral palette (comma separated)</span>
          <input
            type="text"
            value={(activeScenario?.palette.neutral || []).join(', ')}
            onChange={(e) =>
              commit((draft) => {
                const sIndex = Math.max(0, draft.scenarios.findIndex((s) => s.id === draft.activeScenarioId));
                const scenario = draft.scenarios[sIndex] || draft.scenarios[0];
                if (!scenario) return;
                scenario.palette.neutral = parseHexList(e.target.value);
              })
            }
          />
        </label>

        <div className="vds-grid vds-grid--2">
          <label className="vds-field">
            <span>Success</span>
            <input
              type="color"
              value={activeScenario?.palette.semantic.success || '#16a34a'}
              onChange={(e) =>
                commit((draft) => {
                  const sIndex = Math.max(0, draft.scenarios.findIndex((s) => s.id === draft.activeScenarioId));
                  const scenario = draft.scenarios[sIndex] || draft.scenarios[0];
                  if (!scenario) return;
                  scenario.palette.semantic.success = e.target.value;
                })
              }
            />
          </label>
          <label className="vds-field">
            <span>Warning</span>
            <input
              type="color"
              value={activeScenario?.palette.semantic.warning || '#d97706'}
              onChange={(e) =>
                commit((draft) => {
                  const sIndex = Math.max(0, draft.scenarios.findIndex((s) => s.id === draft.activeScenarioId));
                  const scenario = draft.scenarios[sIndex] || draft.scenarios[0];
                  if (!scenario) return;
                  scenario.palette.semantic.warning = e.target.value;
                })
              }
            />
          </label>
          <label className="vds-field">
            <span>Error</span>
            <input
              type="color"
              value={activeScenario?.palette.semantic.error || '#dc2626'}
              onChange={(e) =>
                commit((draft) => {
                  const sIndex = Math.max(0, draft.scenarios.findIndex((s) => s.id === draft.activeScenarioId));
                  const scenario = draft.scenarios[sIndex] || draft.scenarios[0];
                  if (!scenario) return;
                  scenario.palette.semantic.error = e.target.value;
                })
              }
            />
          </label>
          <label className="vds-field">
            <span>Info</span>
            <input
              type="color"
              value={activeScenario?.palette.semantic.info || '#2563eb'}
              onChange={(e) =>
                commit((draft) => {
                  const sIndex = Math.max(0, draft.scenarios.findIndex((s) => s.id === draft.activeScenarioId));
                  const scenario = draft.scenarios[sIndex] || draft.scenarios[0];
                  if (!scenario) return;
                  scenario.palette.semantic.info = e.target.value;
                })
              }
            />
          </label>
        </div>

        <div className="vds-subheading">Color ratios</div>
        <div className="vds-stack">
          {(activeScenario?.ratios || []).map((row, idx) => (
            <div key={`${row.scope}-${idx}`} className="vds-ratio-row">
              <select value={row.scope} onChange={(e) => upsertRatio(idx, { scope: e.target.value as VisionColorRatioV1['scope'] })}>
                <option value="ui">ui</option>
                <option value="icons">icons</option>
                <option value="images">images</option>
                <option value="all">all</option>
              </select>
              <input type="number" min={0} max={100} value={row.neutralPct} onChange={(e) => upsertRatio(idx, { neutralPct: Number(e.target.value) })} />
              <input type="number" min={0} max={100} value={row.primaryPct} onChange={(e) => upsertRatio(idx, { primaryPct: Number(e.target.value) })} />
              <input type="number" min={0} max={100} value={row.accentPct} onChange={(e) => upsertRatio(idx, { accentPct: Number(e.target.value) })} />
              <input type="number" min={0} max={100} value={row.semanticPct} onChange={(e) => upsertRatio(idx, { semanticPct: Number(e.target.value) })} />
              <button
                type="button"
                className="mac-btn h-8"
                disabled={(activeScenario?.ratios || []).length <= 1}
                onClick={() =>
                  commit((draft) => {
                    const sIndex = Math.max(0, draft.scenarios.findIndex((s) => s.id === draft.activeScenarioId));
                    const scenario = draft.scenarios[sIndex] || draft.scenarios[0];
                    if (!scenario || scenario.ratios.length <= 1) return;
                    scenario.ratios.splice(idx, 1);
                  })
                }
              >
                -
              </button>
            </div>
          ))}
          <button
            type="button"
            className="mac-btn h-8"
            onClick={() =>
              commit((draft) => {
                const sIndex = Math.max(0, draft.scenarios.findIndex((s) => s.id === draft.activeScenarioId));
                const scenario = draft.scenarios[sIndex] || draft.scenarios[0];
                if (!scenario) return;
                scenario.ratios.push({ scope: 'ui', neutralPct: 74, primaryPct: 16, accentPct: 6, semanticPct: 4 });
              })
            }
          >
            Add ratio row
          </button>
        </div>

        <label className="vds-field">
          <span>Font family</span>
          <input
            type="text"
            value={value.foundations.fontFamily}
            onChange={(e) =>
              commit((draft) => {
                draft.foundations.fontFamily = e.target.value;
              })
            }
          />
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
      </section>

      <section className="vds-controls__section">
        <h3>Typography and spacing</h3>
        <SliderRow
          label="Typography base size"
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
          value={value.controls.typography.sizeGrowth}
          onChange={(next) =>
            commit((draft) => {
              draft.controls.typography.sizeGrowth = clamp(Math.round(next), 0, 100);
            })
          }
        />
        <SliderRow
          label="Typography weight growth"
          value={value.controls.typography.weightGrowth}
          onChange={(next) =>
            commit((draft) => {
              draft.controls.typography.weightGrowth = clamp(Math.round(next), 0, 100);
            })
          }
        />

        <SliderRow
          label="Spacing pattern"
          value={value.controls.spacing.pattern}
          onChange={(next) =>
            commit((draft) => {
              draft.controls.spacing.pattern = clamp(Math.round(next), 0, 100);
            })
          }
        />
        <SliderRow
          label="Spacing density"
          value={value.controls.spacing.density}
          onChange={(next) =>
            commit((draft) => {
              draft.controls.spacing.density = clamp(Math.round(next), 0, 100);
            })
          }
        />
        <SliderRow
          label="Around vs inside spacing"
          value={value.controls.spacing.aroundVsInside}
          onChange={(next) =>
            commit((draft) => {
              draft.controls.spacing.aroundVsInside = clamp(Math.round(next), 0, 100);
            })
          }
        />
      </section>

      <section className="vds-controls__section">
        <h3>Global style controls</h3>
        <SliderRow label="Flatness" value={value.controls.flatness} onChange={(next) => commit((draft) => (draft.controls.flatness = clamp(Math.round(next), 0, 100)))} />
        <SliderRow label="Zoning" value={value.controls.zoning} onChange={(next) => commit((draft) => (draft.controls.zoning = clamp(Math.round(next), 0, 100)))} />
        <SliderRow label="Softness" value={value.controls.softness} onChange={(next) => commit((draft) => (draft.controls.softness = clamp(Math.round(next), 0, 100)))} />
        <SliderRow label="Saturation" value={value.controls.saturation} onChange={(next) => commit((draft) => (draft.controls.saturation = clamp(Math.round(next), 0, 100)))} />
        <SliderRow
          label="Color variance"
          value={value.controls.colorVariance}
          onChange={(next) => commit((draft) => (draft.controls.colorVariance = clamp(Math.round(next), 0, 100)))}
        />
        <SliderRow label="Color bleed" value={value.controls.colorBleed} onChange={(next) => commit((draft) => (draft.controls.colorBleed = clamp(Math.round(next), 0, 100)))} />
        <SliderRow
          label="Wireframe feeling"
          value={value.controls.wireframeFeeling}
          onChange={(next) => commit((draft) => (draft.controls.wireframeFeeling = clamp(Math.round(next), 0, 100)))}
        />
        <SliderRow label="Visual range" value={value.controls.visualRange} onChange={(next) => commit((draft) => (draft.controls.visualRange = clamp(Math.round(next), 0, 100)))} />
        <SliderRow
          label="Skeuomorphism"
          value={value.controls.skeuomorphism}
          onChange={(next) => commit((draft) => (draft.controls.skeuomorphism = clamp(Math.round(next), 0, 100)))}
        />
        <SliderRow
          label="Negative zone style"
          value={value.controls.negativeZoneStyle}
          onChange={(next) => commit((draft) => (draft.controls.negativeZoneStyle = clamp(Math.round(next), 0, 100)))}
        />
        <SliderRow label="Boldness" value={value.controls.boldness} onChange={(next) => commit((draft) => (draft.controls.boldness = clamp(Math.round(next), 0, 100)))} />
      </section>
    </div>
  );
}
