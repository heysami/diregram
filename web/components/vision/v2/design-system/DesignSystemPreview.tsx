'use client';

import type { CSSProperties } from 'react';
import { deriveDesignSystemTokens, type VisionDesignSystemV1 } from '@/lib/vision-design-system';

type Props = {
  value: VisionDesignSystemV1;
};

function t(token: string, fallback: number, value: VisionDesignSystemV1) {
  const derived = value.derived || deriveDesignSystemTokens(value);
  const item = derived.typography.tokens.find((x) => x.token === token);
  return item?.sizePx || fallback;
}

export function DesignSystemPreview({ value }: Props) {
  const derived = value.derived || deriveDesignSystemTokens(value);
  const activeScenario = value.scenarios.find((s) => s.id === value.activeScenarioId) || value.scenarios[0];
  const activeImage = value.foundations.imageProfiles[0] || null;

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
    '--vds-radius-card': `${derived.shape.cardRadius}px`,
    '--vds-radius-button': `${derived.shape.buttonRadius}px`,
    '--vds-radius-input': `${derived.shape.inputRadius}px`,
    '--vds-gap': `${derived.spacing.gapPx}px`,
    '--vds-around': `${derived.spacing.aroundPx}px`,
    '--vds-inside': `${derived.spacing.insidePx}px`,
    '--vds-border-width': `${derived.effects.borderWidth}px`,
    '--vds-border-style': derived.effects.borderStyle,
    '--vds-negative-bg': derived.negativeZone.background,
  } as CSSProperties;

  const headingSize = t('h2', 24, value);
  const subHeadingSize = t('h4', 18, value);
  const bodySize = t('body', 14, value);

  return (
    <div className="vds-preview" style={vars}>
      <section className="vds-preview-card">
        <div className="vds-preview-card__title">Theme summary</div>
        <div className="vds-summary-grid" style={{ fontSize: `${bodySize}px` }}>
          <div>
            <strong>Scenario</strong>
            <p>{activeScenario?.name || 'Base'}</p>
          </div>
          <div>
            <strong>Zone policy</strong>
            <p>{derived.composition.boldZonePolicy}</p>
          </div>
          <div>
            <strong>Saturation</strong>
            <p>{derived.composition.saturationPolicy}</p>
          </div>
          <div>
            <strong>Variance</strong>
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
            <div className="vds-shell-headline" style={{ fontSize: `${headingSize}px` }}>
              Weekly operational snapshot
            </div>
            <div className="vds-shell-subtitle" style={{ fontSize: `${subHeadingSize}px` }}>
              Navigation and edge zones respond to boldness and zoning controls.
            </div>
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
          <div className={[ 'vds-tabs', derived.composition.cardUsage > 0.5 ? 'is-bookmark' : 'is-underline' ].join(' ')}>
            <button type="button" className="is-active">Summary</button>
            <button type="button">Breakdown</button>
            <button type="button">Forecast</button>
          </div>
          <div className="vds-preview-note">Flatness changes this from lightweight underlines to heavier tab surfaces.</div>
        </article>

        <article className="vds-preview-card">
          <div className="vds-preview-card__title">List vs card treatment</div>
          <div className="vds-list-preview" data-carded={derived.composition.cardUsage > 0.5 ? '1' : '0'}>
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
          <table className="vds-table" style={{ fontSize: `${bodySize}px` }}>
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
