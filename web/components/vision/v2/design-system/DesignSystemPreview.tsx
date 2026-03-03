'use client';

import type { CSSProperties } from 'react';
import { deriveDesignSystemTokens, type VisionDesignSystemV1, type VisionTypographyTokenV1 } from '@/lib/vision-design-system';

type Props = {
  value: VisionDesignSystemV1;
};

function getToken(tokens: VisionTypographyTokenV1[], token: VisionTypographyTokenV1['token']) {
  return tokens.find((x) => x.token === token) || null;
}

export function DesignSystemPreview({ value }: Props) {
  const derived = value.derived || deriveDesignSystemTokens(value);
  const activeScenario = value.scenarios.find((s) => s.id === value.activeScenarioId) || value.scenarios[0];
  const activeImage = value.foundations.imageProfiles[0] || null;
  const uiRatio = activeScenario?.ratios.find((r) => r.scope === 'ui' || r.scope === 'all') || activeScenario?.ratios[0];

  const caption = getToken(derived.typography.tokens, 'caption');
  const label = getToken(derived.typography.tokens, 'label');
  const body = getToken(derived.typography.tokens, 'body');
  const h4 = getToken(derived.typography.tokens, 'h4');
  const h2 = getToken(derived.typography.tokens, 'h2');

  const vars = {
    '--vds-font-family': value.foundations.fontFamily,
    '--vds-canvas': derived.color.canvasBg,
    '--vds-surface': derived.color.surfaceBg,
    '--vds-panel': derived.color.panelBg,
    '--vds-separator': derived.color.separator,
    '--vds-focus': derived.preview.focusColor,
    '--vds-top-nav-bg': derived.preview.topNavBg,
    '--vds-top-nav-text': derived.preview.topNavText,
    '--vds-left-nav-bg': derived.preview.leftNavBg,
    '--vds-left-nav-text': derived.preview.leftNavText,
    '--vds-card-bg': derived.preview.cardBg,
    '--vds-card-border': derived.preview.cardBorder,
    '--vds-btn-bg': derived.preview.buttonBg,
    '--vds-btn-text': derived.preview.buttonText,
    '--vds-shadow': derived.preview.shadow,
    '--vds-radius-xs': `${derived.shape.radiusXs}px`,
    '--vds-radius-sm': `${derived.shape.radiusSm}px`,
    '--vds-radius-md': `${derived.shape.radiusMd}px`,
    '--vds-radius-lg': `${derived.shape.radiusLg}px`,
    '--vds-radius-xl': `${derived.shape.radiusXl}px`,
    '--vds-radius-card': `${derived.shape.cardRadius}px`,
    '--vds-radius-button': `${derived.shape.buttonRadius}px`,
    '--vds-radius-input': `${derived.shape.inputRadius}px`,
    '--vds-radius-pill': '999px',
    '--vds-gap': `${derived.spacing.gapPx}px`,
    '--vds-stack': `${derived.spacing.stackPx}px`,
    '--vds-compact': `${derived.spacing.compactPx}px`,
    '--vds-micro': `${derived.spacing.microPx}px`,
    '--vds-around': `${derived.spacing.aroundPx}px`,
    '--vds-inside': `${derived.spacing.insidePx}px`,
    '--vds-border-width': `${derived.effects.borderWidth}px`,
    '--vds-border-style': derived.effects.borderStyle,
    '--vds-card-usage': `${derived.composition.cardUsage}`,
    '--vds-zone-contrast': `${derived.composition.zoneContrast}`,
    '--vds-line-opacity': `${derived.effects.wireframeLineOpacity}`,
    '--vds-fill-opacity': `${derived.effects.wireframeFillOpacity}`,
    '--vds-gradient-strength': `${derived.effects.gradientStrength}`,
    '--vds-bevel-strength': `${derived.effects.bevelStrength}`,
    '--vds-gloss-strength': `${derived.effects.glossStrength}`,
    '--vds-inner-shadow-strength': `${derived.effects.innerShadowStrength}`,
    '--vds-negative-bg': derived.negativeZone.background,
    '--vds-type-caption-size': `${caption?.sizePx || 12}px`,
    '--vds-type-caption-weight': `${caption?.weight || 400}`,
    '--vds-type-label-size': `${label?.sizePx || 13}px`,
    '--vds-type-label-weight': `${label?.weight || 500}`,
    '--vds-type-body-size': `${body?.sizePx || 15}px`,
    '--vds-type-body-weight': `${body?.weight || 400}`,
    '--vds-type-subtitle-size': `${h4?.sizePx || 20}px`,
    '--vds-type-subtitle-weight': `${h4?.weight || 600}`,
    '--vds-type-title-size': `${h2?.sizePx || 28}px`,
    '--vds-type-title-weight': `${h2?.weight || 720}`,
  } as CSSProperties;

  return (
    <div
      className="vds-preview"
      style={vars}
      data-carded={derived.composition.cardUsage > 0.5 ? '1' : '0'}
      data-wireframe={derived.effects.wireframeMix > 0.6 ? '1' : '0'}
      data-visual-range={derived.effects.visualRangeMix > 0.55 ? '1' : '0'}
      data-skeuo={derived.effects.materialBudget > 0.5 ? '1' : '0'}
    >
      <section className="vds-preview-card">
        <div className="vds-preview-card__title">Design system summary</div>
        <div className="vds-summary-grid">
          <div>
            <strong>Scenario</strong>
            <p>{activeScenario?.name || 'Base'}</p>
          </div>
          <div>
            <strong>Bold zone policy</strong>
            <p>{derived.composition.boldZonePolicy}</p>
          </div>
          <div>
            <strong>Saturation policy</strong>
            <p>{derived.composition.saturationPolicy}</p>
          </div>
          <div>
            <strong>Variance level</strong>
            <p>{derived.composition.varianceLevel}</p>
          </div>
          <div>
            <strong>Negative zone</strong>
            <p>{derived.negativeZone.mode}</p>
          </div>
          <div>
            <strong>Card usage</strong>
            <p>{Math.round(derived.composition.cardUsage * 100)}%</p>
          </div>
        </div>
        {uiRatio ? (
          <div className="vds-ratio-preview">
            <div className="vds-ratio-preview__label">UI color ratio</div>
            <div className="vds-ratio-bar">
              <span style={{ width: `${uiRatio.neutralPct}%` }} className="is-neutral" />
              <span style={{ width: `${uiRatio.primaryPct}%` }} className="is-primary" />
              <span style={{ width: `${uiRatio.accentPct}%` }} className="is-accent" />
              <span style={{ width: `${uiRatio.semanticPct}%` }} className="is-semantic" />
            </div>
          </div>
        ) : null}
      </section>

      <section className="vds-preview-shell">
        <header className="vds-shell-topbar">
          <strong>Project dashboard</strong>
          <div className="vds-shell-topbar__meta">
            <span>Global search</span>
            <span>Notifications</span>
            <span>User</span>
          </div>
        </header>
        <div className="vds-shell-body">
          <aside className="vds-shell-leftnav">
            <div className="vds-nav-item is-active">Overview</div>
            <div className="vds-nav-item">Operations</div>
            <div className="vds-nav-item">Customers</div>
            <div className="vds-nav-item">Billing</div>
            <div className="vds-nav-item">Settings</div>
          </aside>
          <main className="vds-shell-content">
            <div className="vds-shell-headline">Weekly operational snapshot</div>
            <div className="vds-shell-subtitle">Type scale, edge-zone boldness, and zoning depth respond to your controls.</div>
            <div className="vds-kpi-grid">
              <div className="vds-kpi-card">
                <div>Conversion</div>
                <strong>18.2%</strong>
              </div>
              <div className="vds-kpi-card">
                <div>Avg response</div>
                <strong>3m 20s</strong>
              </div>
              <div className="vds-kpi-card">
                <div>Pending issues</div>
                <strong>12</strong>
              </div>
            </div>
          </main>
        </div>
      </section>

      <section className="vds-preview-grid">
        <article className="vds-preview-card">
          <div className="vds-preview-card__title">Tabs and segmented controls</div>
          <div className={['vds-tabs', derived.composition.cardUsage > 0.5 ? 'is-bookmark' : 'is-underline'].join(' ')}>
            <button type="button" className="is-active">
              Summary
            </button>
            <button type="button">Breakdown</button>
            <button type="button">Forecast</button>
          </div>
          <div className="vds-preview-note">Flatness + softness combine to shift between line tabs and heavier tab surfaces.</div>
        </article>

        <article className="vds-preview-card">
          <div className="vds-preview-card__title">List vs card treatment</div>
          <div className="vds-list-preview">
            <div className="vds-list-row">
              <span>Order #1287</span>
              <span>Shipped</span>
            </div>
            <div className="vds-list-row">
              <span>Order #1288</span>
              <span>Review</span>
            </div>
            <div className="vds-list-row">
              <span>Order #1289</span>
              <span>Pending</span>
            </div>
          </div>
        </article>

        <article className="vds-preview-card">
          <div className="vds-preview-card__title">Forms and controls</div>
          <label className="vds-form-field">
            <span>Project name</span>
            <input type="text" value="Core redesign" readOnly />
          </label>
          <label className="vds-form-field">
            <span>Owner</span>
            <select value="sam" disabled>
              <option value="sam">Sam</option>
            </select>
          </label>
          <div className="vds-form-actions">
            <button type="button" className="is-secondary">
              Cancel
            </button>
            <button type="button" className="is-primary">
              Save changes
            </button>
          </div>
        </article>

        <article className="vds-preview-card">
          <div className="vds-preview-card__title">Table density sample</div>
          <table className="vds-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Status</th>
                <th>Score</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Alex</td>
                <td>Active</td>
                <td>94</td>
              </tr>
              <tr>
                <td>Rina</td>
                <td>Review</td>
                <td>81</td>
              </tr>
              <tr>
                <td>Omar</td>
                <td>Blocked</td>
                <td>55</td>
              </tr>
            </tbody>
          </table>
        </article>

        <article className="vds-preview-card">
          <div className="vds-preview-card__title">Accent variance sample</div>
          <div className="vds-chip-row">
            {(derived.color.accents.length ? derived.color.accents : [derived.color.primary]).map((color, i) => (
              <span key={`${color}-${i}`} className="vds-chip" style={{ background: color }}>
                Accent {i + 1}
              </span>
            ))}
          </div>
          <div className="vds-preview-note">Higher color variance enables more accent families and broader hue spread.</div>
        </article>

        <article className="vds-preview-card">
          <div className="vds-preview-card__title">Modal/dialog treatment</div>
          <div className="vds-modal-frame">
            <div className="vds-modal-head">Archive project?</div>
            <p>This action moves the project out of active workspaces. You can restore it later.</p>
            <div className="vds-form-actions">
              <button type="button" className="is-secondary">
                Keep project
              </button>
              <button type="button" className="is-primary">
                Archive
              </button>
            </div>
          </div>
        </article>

        <article className="vds-preview-card vds-negative-zone-sample">
          <div className="vds-preview-card__title">Negative zone style</div>
          <div className="vds-negative-zone-box" />
          <div className="vds-preview-note">Mode: {derived.negativeZone.mode}</div>
        </article>

        <article className="vds-preview-card">
          <div className="vds-preview-card__title">Image style placeholder</div>
          <div className="vds-image-sample">
            {activeImage?.placeholder ? <img src={activeImage.placeholder} alt={activeImage.name} /> : <div className="vds-image-fallback">No placeholder</div>}
          </div>
          <div className="vds-preview-note">
            <strong>{activeImage?.name || 'Default profile'}</strong>
            <br />
            {activeImage?.style || 'Style not set'} · {activeImage?.lighting || 'Lighting not set'} · {activeImage?.lineWeight || 'Line weight not set'}
          </div>
        </article>
      </section>
    </div>
  );
}
