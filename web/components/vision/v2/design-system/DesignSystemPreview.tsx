'use client';

import { useState, type CSSProperties } from 'react';
import { deriveDesignSystemTokens, type VisionDesignSystemV1, type VisionTypographyTokenV1 } from '@/lib/vision-design-system';

type Props = {
  value: VisionDesignSystemV1;
};

function getToken(tokens: VisionTypographyTokenV1[], token: VisionTypographyTokenV1['token']) {
  return tokens.find((x) => x.token === token) || null;
}

function colorAt(pool: string[], index: number, fallback: string) {
  return pool[index % Math.max(pool.length, 1)] || fallback;
}

export function DesignSystemPreview({ value }: Props) {
  const derived = value.derived || deriveDesignSystemTokens(value);
  const [previewTheme, setPreviewTheme] = useState<'light' | 'dark'>('light');
  const activeScenario = value.scenarios.find((s) => s.id === value.activeScenarioId) || value.scenarios[0];
  const activeImage = value.foundations.imageProfiles[0] || null;
  const uiRatio = activeScenario?.ratios.find((r) => r.scope === 'ui' || r.scope === 'all') || activeScenario?.ratios[0];
  const showDarkPreview = Boolean(value.controls.darkMode.showPreview);
  const themeMode: 'light' | 'dark' = showDarkPreview && previewTheme === 'dark' ? 'dark' : 'light';
  const modeColor = themeMode === 'dark' ? derived.dark.color : null;
  const modePreview = themeMode === 'dark' ? derived.dark.preview : derived.preview;
  const modePrimary = themeMode === 'dark' ? modeColor!.primary : derived.color.primary;
  const modeAccents = themeMode === 'dark' ? [modeColor!.accent, ...derived.color.accents] : derived.color.accents;

  const caption = getToken(derived.typography.tokens, 'caption');
  const label = getToken(derived.typography.tokens, 'label');
  const body = getToken(derived.typography.tokens, 'body');
  const h4 = getToken(derived.typography.tokens, 'h4');
  const h2 = getToken(derived.typography.tokens, 'h2');

  const itemColors =
    themeMode === 'dark'
      ? modeColor!.itemColors.length
        ? modeColor!.itemColors
        : [modePrimary, ...modeAccents]
      : derived.color.itemColors.length
        ? derived.color.itemColors
        : [modePrimary, ...modeAccents];
  const itemTextColors =
    themeMode === 'dark'
      ? modeColor!.itemTextColors.length
        ? modeColor!.itemTextColors
        : [derived.color.textOnPrimary]
      : derived.color.itemTextColors.length
        ? derived.color.itemTextColors
        : [derived.color.textOnPrimary];
  const fontVarianceLabel =
    value.controls.fontVariance === 'singleDecorative'
      ? 'Single + decorative'
      : value.controls.fontVariance === 'splitHeading'
        ? 'Split heading'
        : value.controls.fontVariance === 'splitHeadingDecorative'
          ? 'Split + decorative'
          : 'Single font';
  const pillTargets = new Set(value.controls.pillTargets || []);
  const previewInputRadiusPx = pillTargets.has('inputs') ? 999 : Math.max(0, Math.round(derived.shape.inputRadius));
  const previewInputStyle = {
    '--dg-control-radius': `${previewInputRadiusPx}px`,
  } as CSSProperties;

  const vars = {
    '--vds-font-family': derived.typography.fontFamily,
    '--vds-font-heading': derived.typography.headingFontFamily,
    '--vds-font-decorative': derived.typography.decorativeFontFamily,
    '--vds-canvas': themeMode === 'dark' ? modeColor!.canvasBg : derived.color.canvasBg,
    '--vds-surface': themeMode === 'dark' ? modeColor!.surfaceBg : derived.color.surfaceBg,
    '--vds-panel': themeMode === 'dark' ? modeColor!.panelBg : derived.color.panelBg,
    '--vds-separator': themeMode === 'dark' ? modeColor!.separator : derived.color.separator,
    '--vds-focus': modePreview.focusColor,
    '--vds-text-primary': themeMode === 'dark' ? modeColor!.textPrimary : derived.color.textPrimary,
    '--vds-text-secondary': themeMode === 'dark' ? modeColor!.textSecondary : derived.color.textSecondary,
    '--vds-text-muted': themeMode === 'dark' ? modeColor!.textMuted : derived.color.textMuted,
    '--vds-top-nav-bg': modePreview.topNavBg,
    '--vds-top-nav-text': modePreview.topNavText,
    '--vds-top-action-bg': modePreview.topNavActionBg,
    '--vds-top-action-text': modePreview.topNavActionText,
    '--vds-top-action-border': modePreview.topNavActionBorder,
    '--vds-left-nav-bg': modePreview.leftNavBg,
    '--vds-left-nav-text': modePreview.leftNavText,
    '--vds-left-action-bg': modePreview.leftNavActionBg,
    '--vds-left-action-text': modePreview.leftNavActionText,
    '--vds-left-action-border': modePreview.leftNavActionBorder,
    '--vds-content-bg': modePreview.contentBg,
    '--vds-card-bg': modePreview.cardBg,
    '--vds-card-border': modePreview.cardBorder,
    '--vds-btn-bg': modePreview.buttonBg,
    '--vds-btn-text': modePreview.buttonText,
    '--vds-shadow': modePreview.shadow,
    '--vds-shadow-color': modePreview.shadowColor,
    '--vds-shadow-accent': modePreview.shadowAccent,
    '--vds-shadow-highlight': modePreview.shadowHighlight,
    '--vds-gradient-from': modePreview.gradientFrom,
    '--vds-gradient-mid': modePreview.gradientMid,
    '--vds-gradient-to': modePreview.gradientTo,
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
    '--vds-zone-levels': `${derived.composition.zoneLevels}`,
    '--vds-line-opacity': `${derived.effects.wireframeLineOpacity}`,
    '--vds-fill-opacity': `${derived.effects.wireframeFillOpacity}`,
    '--vds-gradient-strength': `${derived.effects.gradientStrength}`,
    '--vds-bevel-strength': `${derived.effects.bevelStrength}`,
    '--vds-gloss-strength': `${derived.effects.glossStrength}`,
    '--vds-inner-shadow-strength': `${derived.effects.innerShadowStrength}`,
    '--vds-flatness': `${derived.composition.cardUsage}`,
    '--vds-zoning': `${derived.composition.zoneContrast}`,
    '--vds-boldness': `${value.controls.boldness / 100}`,
    '--vds-variance': `${value.controls.colorVariance / 100}`,
    '--vds-surface-sat': `${value.controls.surfaceSaturation / 100}`,
    '--vds-item-sat': `${value.controls.itemSaturation / 100}`,
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
    '--vds-type-caption-opacity': `${derived.typography.captionOpacity}`,
    '--vds-type-label-opacity': `${derived.typography.labelOpacity}`,
    '--vds-type-body-opacity': `${derived.typography.bodyOpacity}`,
    '--vds-type-subdued-opacity': `${derived.typography.subduedOpacity}`,
    '--vds-item-color-1': colorAt(itemColors, 0, modePrimary),
    '--vds-item-color-2': colorAt(itemColors, 1, modeAccents[0] || modePrimary),
    '--vds-item-color-3': colorAt(itemColors, 2, modeAccents[1] || modePrimary),
    '--vds-item-color-4': colorAt(itemColors, 3, modeAccents[2] || modePrimary),
    '--vds-item-color-5': colorAt(itemColors, 4, modeAccents[0] || modePrimary),
    '--vds-item-color-6': colorAt(itemColors, 5, modeAccents[1] || modePrimary),
    '--vds-item-text-1': colorAt(itemTextColors, 0, derived.color.textOnPrimary),
    '--vds-item-text-2': colorAt(itemTextColors, 1, derived.color.textOnPrimary),
    '--vds-item-text-3': colorAt(itemTextColors, 2, derived.color.textOnPrimary),
    '--vds-item-text-4': colorAt(itemTextColors, 3, derived.color.textOnPrimary),
    '--vds-item-text-5': colorAt(itemTextColors, 4, derived.color.textOnPrimary),
    '--vds-item-text-6': colorAt(itemTextColors, 5, derived.color.textOnPrimary),
    '--dg-control-radius': `${previewInputRadiusPx}px`,
  } as CSSProperties;

  return (
    <>
      {showDarkPreview ? (
        <div className="vds-preview-mode-toggle">
          <button type="button" className={previewTheme === 'light' ? 'is-active' : ''} onClick={() => setPreviewTheme('light')}>
            Light preview
          </button>
          <button type="button" className={previewTheme === 'dark' ? 'is-active' : ''} onClick={() => setPreviewTheme('dark')}>
            Dark preview
          </button>
        </div>
      ) : null}
      <div
        className="vds-preview"
        style={vars}
        data-preview-theme={themeMode}
        data-carded={derived.composition.cardUsage > 0.5 ? '1' : '0'}
        data-wireframe={derived.effects.wireframeMix > 0.6 ? '1' : '0'}
        data-wire-mode={derived.effects.wireframeMix < 0.18 ? 'low' : derived.effects.wireframeMix > 0.66 ? 'high' : 'mid'}
        data-visual-range={derived.effects.visualRangeMix > 0.55 ? '1' : '0'}
        data-skeuo={derived.effects.materialBudget > 0.5 ? '1' : '0'}
        data-skeuo-style={value.controls.skeuomorphismStyle}
        data-variance={value.controls.colorVariance > 60 ? 'high' : value.controls.colorVariance > 30 ? 'medium' : 'low'}
        data-zoning={value.controls.zoning > 66 ? 'high' : value.controls.zoning > 33 ? 'mid' : 'low'}
        data-flat-mode={derived.composition.cardUsage < 0.34 ? 'line' : derived.composition.cardUsage < 0.67 ? 'mixed' : 'card'}
        data-font-variance={value.controls.fontVariance}
        data-bold-type-style={value.controls.boldTypographyStyle}
        data-flatness={Math.round(derived.composition.cardUsage * 100)}
        data-pill-buttons={pillTargets.has('buttons') ? '1' : '0'}
        data-pill-inputs={pillTargets.has('inputs') ? '1' : '0'}
        data-pill-chips={pillTargets.has('chips') ? '1' : '0'}
        data-pill-tabs={pillTargets.has('tabs') ? '1' : '0'}
        data-pill-nav={pillTargets.has('navItems') ? '1' : '0'}
        data-pill-table-tags={pillTargets.has('tableTags') ? '1' : '0'}
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
          <div>
            <strong>Font variance</strong>
            <p>{fontVarianceLabel}</p>
          </div>
        </div>
        {uiRatio ? (
          <div className="vds-ratio-preview">
            <div className="vds-ratio-preview__label">UI primitive ratio</div>
            <div className="vds-ratio-bar">
              {(uiRatio.primitiveBreakdown || []).map((entry) => {
                const primitive = entry.primitiveId === 'primary' ? null : entry.primitiveId;
                const color =
                  entry.primitiveId === 'primary'
                    ? 'var(--vds-item-color-1)'
                    : primitive?.startsWith('slate-') || primitive?.startsWith('zinc-')
                      ? '#d4d4d8'
                      : undefined;
                return <span key={entry.id} style={{ width: `${entry.pct}%`, background: color }} />;
              })}
            </div>
            <div className="vds-ratio-preview__legend">
              {(uiRatio.primitiveBreakdown || []).slice(0, 6).map((entry) => (
                <span key={`${entry.id}-legend`}>
                  {entry.primitiveId} {entry.pct}% ({entry.usage || 'all'})
                </span>
              ))}
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
            <button type="button" className="vds-shell-action is-primary">
              New report
            </button>
          </div>
        </header>
        <div className="vds-shell-body">
          <aside className="vds-shell-leftnav">
            <div className="vds-nav-item is-active">Overview</div>
            <div className="vds-nav-item">Operations</div>
            <div className="vds-nav-item">Customers</div>
            <div className="vds-nav-item">Billing</div>
            <div className="vds-nav-item">Settings</div>
            <div className="vds-shell-leftnav__actions">
              <button type="button" className="vds-shell-action is-primary is-block">
                + Create
              </button>
            </div>
          </aside>
          <main className="vds-shell-content">
            <div className="vds-shell-headline">Weekly operational snapshot</div>
            <div className="vds-shell-subtitle">Type hierarchy, spacing rhythm, and zoning depth adapt in real time.</div>
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
        {value.controls.fontVariance !== 'single' ? (
          <article className="vds-preview-card">
            <div className="vds-preview-card__title">Font variance showcase</div>
            <div className="vds-font-showcase">
              <div className="vds-font-decor-bg">KINETIC SIGNAL</div>
              <div className="vds-font-tech-label">System narrative layer</div>
              <h3 className="vds-font-hero-title">Adaptive commerce interface</h3>
              <p className="vds-font-body-line">UI controls stay consistent while hero/decorative text can split by mode.</p>
            </div>
          </article>
        ) : null}

        <article className="vds-preview-card">
          <div className="vds-preview-card__title">Zoning depth</div>
          <div className="vds-zone-stack">
            <div className="vds-zone-layer is-level-1">
              Workspace zone
              <div className="vds-zone-layer is-level-2">
                Content zone
                <div className="vds-zone-layer is-level-3">Detail zone</div>
              </div>
            </div>
          </div>
          <div className="vds-preview-note">Low zoning keeps one plane. High zoning increases distinct nested surfaces and separation.</div>
        </article>

        <article className="vds-preview-card">
          <div className="vds-preview-card__title">Tabs and segmented controls</div>
          <div className={['vds-tabs', derived.composition.cardUsage > 0.5 ? 'is-bookmark' : 'is-underline'].join(' ')}>
            <button type="button" className="is-active">
              Summary
            </button>
            <button type="button">Breakdown</button>
            <button type="button">Forecast</button>
          </div>
          <div className="vds-preview-note">Flatness + softness shift from line tabs to heavier segmented tab bodies.</div>
        </article>

        <article className="vds-preview-card">
          <div className="vds-preview-card__title">List vs card treatment</div>
          <div className="vds-list-preview">
            <div className="vds-list-row">
              <span className="vds-dot" style={{ background: 'var(--vds-item-color-1)' }} />
              <div className="vds-list-main">
                <strong>Order #1287</strong>
                <span>Priority fulfillment</span>
              </div>
              <span className="vds-list-state is-good">Shipped</span>
            </div>
            <div className="vds-list-row">
              <span className="vds-dot" style={{ background: 'var(--vds-item-color-2)' }} />
              <div className="vds-list-main">
                <strong>Order #1288</strong>
                <span>Address mismatch</span>
              </div>
              <span className="vds-list-state is-warn">Review</span>
            </div>
            <div className="vds-list-row">
              <span className="vds-dot" style={{ background: 'var(--vds-item-color-3)' }} />
              <div className="vds-list-main">
                <strong>Order #1289</strong>
                <span>Awaiting payment</span>
              </div>
              <span className="vds-list-state is-muted">Pending</span>
            </div>
          </div>
        </article>

        <article className="vds-preview-card">
          <div className="vds-preview-card__title">Forms and controls</div>
          <label className="vds-form-field">
            <span>Project name</span>
            <input type="text" value="Core redesign" readOnly style={previewInputStyle} />
          </label>
          <label className="vds-form-field">
            <span>Owner</span>
            <select value="sam" disabled style={previewInputStyle}>
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
                <td>
                  <span className="vds-dot" style={{ background: 'var(--vds-item-color-1)' }} /> Alex
                </td>
                <td>
                  <span className="vds-table__tag" style={{ background: 'var(--vds-item-color-1)', color: 'var(--vds-item-text-1)' }}>
                    Active
                  </span>
                </td>
                <td>94</td>
              </tr>
              <tr>
                <td>
                  <span className="vds-dot" style={{ background: 'var(--vds-item-color-2)' }} /> Rina
                </td>
                <td>
                  <span className="vds-table__tag" style={{ background: 'var(--vds-item-color-2)', color: 'var(--vds-item-text-2)' }}>
                    Review
                  </span>
                </td>
                <td>81</td>
              </tr>
              <tr>
                <td>
                  <span className="vds-dot" style={{ background: 'var(--vds-item-color-3)' }} /> Omar
                </td>
                <td>
                  <span className="vds-table__tag" style={{ background: 'var(--vds-item-color-3)', color: 'var(--vds-item-text-3)' }}>
                    Blocked
                  </span>
                </td>
                <td>55</td>
              </tr>
            </tbody>
          </table>
        </article>

        <article className="vds-preview-card">
          <div className="vds-preview-card__title">Semantic states</div>
          <div className="vds-semantic-stack">
            <div className="vds-semantic-card is-success">Success: Deployment is healthy</div>
            <div className="vds-semantic-card is-warning">Warning: 3 items need review</div>
            <div className="vds-semantic-card is-error">Error: Payment connection failed</div>
            <div className="vds-semantic-card is-info">Info: New version available</div>
          </div>
        </article>

        <article className="vds-preview-card">
          <div className="vds-preview-card__title">Button and badge variants</div>
          <div className="vds-variant-row">
            <button type="button" className="is-primary">
              Primary
            </button>
            <button type="button" className="is-secondary">
              Secondary
            </button>
            <button type="button" className="is-ghost">
              Ghost
            </button>
          </div>
          <div className="vds-chip-row">
            <span className="vds-chip" style={{ background: 'var(--vds-item-color-1)', color: 'var(--vds-item-text-1)' }}>
              In progress
            </span>
            <span className="vds-chip" style={{ background: 'var(--vds-item-color-2)', color: 'var(--vds-item-text-2)' }}>
              On hold
            </span>
            <span className="vds-chip" style={{ background: 'var(--vds-item-color-3)', color: 'var(--vds-item-text-3)' }}>
              Completed
            </span>
          </div>
        </article>

        <article className="vds-preview-card">
          <div className="vds-preview-card__title">Semantic feedback elements</div>
          <div className="vds-alert-stack">
            <div className="vds-alert is-success">
              <strong>Success</strong>
              <span>Inventory synced 2m ago</span>
            </div>
            <div className="vds-alert is-warning">
              <strong>Warning</strong>
              <span>2 shipments delayed</span>
            </div>
            <div className="vds-alert is-error">
              <strong>Error</strong>
              <span>Payment gateway timeout</span>
            </div>
            <div className="vds-alert is-info">
              <strong>Info</strong>
              <span>New SLA policy available</span>
            </div>
          </div>
        </article>

        <article className="vds-preview-card">
          <div className="vds-preview-card__title">Activity feed and metadata</div>
          <div className="vds-activity-list">
            <div className="vds-activity-item">
              <span className="vds-dot" style={{ background: 'var(--vds-item-color-1)' }} />
              <div>
                <strong>Build deployed</strong>
                <p>api-gateway • 2 minutes ago</p>
              </div>
            </div>
            <div className="vds-activity-item">
              <span className="vds-dot" style={{ background: 'var(--vds-item-color-4)' }} />
              <div>
                <strong>Escalation opened</strong>
                <p>Billing queue • 18 minutes ago</p>
              </div>
            </div>
            <div className="vds-activity-item">
              <span className="vds-dot" style={{ background: 'var(--vds-item-color-5)' }} />
              <div>
                <strong>Retention trend updated</strong>
                <p>Analytics • 31 minutes ago</p>
              </div>
            </div>
          </div>
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
    </>
  );
}
