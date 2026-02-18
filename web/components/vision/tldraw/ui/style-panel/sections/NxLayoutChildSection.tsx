'use client';

import type { Editor } from 'tldraw';
import {
  NX_LAYOUT_CHILD_META_KEY,
  NX_LAYOUT_CONSTRAINTS_META_KEY,
  readNxConstraints,
  readNxLayoutChildMeta,
  type NxLayoutChildSizeMode,
} from '@/components/vision/tldraw/layout/nxLayoutMeta';
import { ensureParentAxisFixedForFill } from '@/components/vision/tldraw/layout/nxLayoutFillConflict';

export function NxLayoutChildSection({
  editor,
  targets,
  parent,
}: {
  editor: Editor;
  targets: any[];
  parent: any;
}) {
  const first = Array.isArray(targets) ? targets[0] : null;
  if (!first || !parent) return null;
  if (String(parent.type || '') !== 'nxlayout') return null;

  const parentMode = String(parent.props?.layoutMode || 'manual') === 'auto' ? 'auto' : 'manual';
  const parentDirection = String(parent.props?.direction || 'vertical') === 'horizontal' ? 'horizontal' : 'vertical';
  const parentSizeX = String(parent.props?.sizeX || 'fixed') === 'hug' ? 'hug' : 'fixed';
  const parentSizeY = String(parent.props?.sizeY || 'fixed') === 'hug' ? 'hug' : 'fixed';

  const metas = (targets || []).map((t) => readNxLayoutChildMeta(t?.meta));
  const consList = (targets || []).map((t) => readNxConstraints(t?.meta));

  const shared = <T,>(arr: T[], key: (x: T) => any) => {
    if (!arr.length) return { mixed: false, value: null as any };
    const v0 = key(arr[0]);
    for (let i = 1; i < arr.length; i++) {
      if (key(arr[i]) !== v0) return { mixed: true, value: v0 };
    }
    return { mixed: false, value: v0 };
  };

  const sizeXShared = shared(metas, (m) => m.sizeX);
  const sizeYShared = shared(metas, (m) => m.sizeY);
  const alignSelfShared = shared(metas, (m) => m.alignSelf || '');
  const consHShared = shared(consList, (c) => c.h);
  const consVShared = shared(consList, (c) => c.v);

  const updateChildMeta = (patch: any) => {
    try {
      const updates = (targets || []).map((t) => {
        const prev = (t?.meta && typeof t.meta === 'object' ? t.meta : {}) as any;
        const nextChildMeta = { ...(prev[NX_LAYOUT_CHILD_META_KEY] || {}), ...patch };
        return {
          id: t.id,
          type: t.type,
          meta: {
            ...(prev || {}),
            [NX_LAYOUT_CHILD_META_KEY]: nextChildMeta,
          },
        } as any;
      });
      if (updates.length) editor.updateShapes(updates as any);
    } catch {
      // ignore
    }
  };

  const updateConstraints = (patch: any) => {
    try {
      const updates = (targets || []).map((t) => {
        const prev = (t?.meta && typeof t.meta === 'object' ? t.meta : {}) as any;
        const next = { ...(prev[NX_LAYOUT_CONSTRAINTS_META_KEY] || {}), ...patch };
        return { id: t.id, type: t.type, meta: { ...(prev || {}), [NX_LAYOUT_CONSTRAINTS_META_KEY]: next } } as any;
      });
      if (updates.length) editor.updateShapes(updates as any);
    } catch {
      // ignore
    }
  };

  const sizeModeOptions = (axis: 'x' | 'y') => {
    return (
      <>
        <option value="fixed">Fixed</option>
        <option value="hug">Hug</option>
        <option value="fill">Fill</option>
      </>
    );
  };

  const setSize = (axis: 'x' | 'y', next: NxLayoutChildSizeMode) => {
    if (parentMode === 'auto' && next === 'fill') ensureParentAxisFixedForFill(editor, parent, axis);
    updateChildMeta(axis === 'x' ? { sizeX: next } : { sizeY: next });
  };

  return (
    <div className="nx-vsp-section">
      <div className="nx-vsp-title">Layout child</div>
      <div className="nx-vsp-group">
        <div className="nx-vsp-stack">
          {parentMode === 'auto' ? (
            <>
              <div className="nx-vsp-row">
                <div className="nx-vsp-icon">W</div>
                <select
                  className="nx-vsp-select flex-1"
                  value={sizeXShared.mixed ? 'mixed' : sizeXShared.value}
                  onChange={(e) => setSize('x', String(e.target.value || 'fixed') as any)}
                  title="Width behavior"
                >
                  {sizeXShared.mixed ? (
                    <option value="mixed" disabled>
                      mixed
                    </option>
                  ) : null}
                  {sizeModeOptions('x')}
                </select>
                <div className="nx-vsp-icon">H</div>
                <select
                  className="nx-vsp-select flex-1"
                  value={sizeYShared.mixed ? 'mixed' : sizeYShared.value}
                  onChange={(e) => setSize('y', String(e.target.value || 'fixed') as any)}
                  title="Height behavior"
                >
                  {sizeYShared.mixed ? (
                    <option value="mixed" disabled>
                      mixed
                    </option>
                  ) : null}
                  {sizeModeOptions('y')}
                </select>
              </div>

              {parentSizeX === 'hug' || parentSizeY === 'hug' ? (
                <div className="nx-vsp-hint">If you choose Fill, we’ll switch the parent from Hug to Fixed on that axis.</div>
              ) : null}
            </>
          ) : null}

          {parentMode === 'manual' ? (
            <>
              <div className="nx-vsp-row">
                <div className="nx-vsp-icon">↔</div>
                {(() => {
                  const raw = consHShared.value as any;
                  const mode = raw === 'leftRight' ? 'stretch' : 'anchor';
                  const anchor = raw === 'center' || raw === 'right' || raw === 'left' ? raw : 'left';
                  return (
                    <>
                      <select
                        className="nx-vsp-select flex-1"
                        value={consHShared.mixed ? 'mixed' : mode}
                        onChange={(e) => {
                          const next = String(e.target.value || 'anchor');
                          if (next === 'stretch') return updateConstraints({ h: 'leftRight' });
                          // Anchor
                          return updateConstraints({ h: anchor });
                        }}
                        title="Horizontal mode"
                      >
                        {consHShared.mixed ? (
                          <option value="mixed" disabled>
                            mixed
                          </option>
                        ) : null}
                        <option value="anchor">Anchor</option>
                        <option value="stretch">Stretch</option>
                      </select>
                      <select
                        className="nx-vsp-select flex-1"
                        value={consHShared.mixed ? 'mixed' : anchor}
                        onChange={(e) => updateConstraints({ h: String(e.target.value || 'left') })}
                        title="Horizontal anchor"
                        disabled={consHShared.mixed || mode !== 'anchor'}
                      >
                        {consHShared.mixed ? (
                          <option value="mixed" disabled>
                            mixed
                          </option>
                        ) : null}
                        <option value="left">Left</option>
                        <option value="center">Center</option>
                        <option value="right">Right</option>
                      </select>
                    </>
                  );
                })()}
              </div>
              <div className="nx-vsp-row">
                <div className="nx-vsp-icon">↕</div>
                {(() => {
                  const raw = consVShared.value as any;
                  const mode = raw === 'topBottom' ? 'stretch' : 'anchor';
                  const anchor = raw === 'center' || raw === 'bottom' || raw === 'top' ? raw : 'top';
                  return (
                    <>
                      <select
                        className="nx-vsp-select flex-1"
                        value={consVShared.mixed ? 'mixed' : mode}
                        onChange={(e) => {
                          const next = String(e.target.value || 'anchor');
                          if (next === 'stretch') return updateConstraints({ v: 'topBottom' });
                          return updateConstraints({ v: anchor });
                        }}
                        title="Vertical mode"
                      >
                        {consVShared.mixed ? (
                          <option value="mixed" disabled>
                            mixed
                          </option>
                        ) : null}
                        <option value="anchor">Anchor</option>
                        <option value="stretch">Stretch</option>
                      </select>
                      <select
                        className="nx-vsp-select flex-1"
                        value={consVShared.mixed ? 'mixed' : anchor}
                        onChange={(e) => updateConstraints({ v: String(e.target.value || 'top') })}
                        title="Vertical anchor"
                        disabled={consVShared.mixed || mode !== 'anchor'}
                      >
                        {consVShared.mixed ? (
                          <option value="mixed" disabled>
                            mixed
                          </option>
                        ) : null}
                        <option value="top">Top</option>
                        <option value="center">Middle</option>
                        <option value="bottom">Bottom</option>
                      </select>
                    </>
                  );
                })()}
              </div>
              <div className="nx-vsp-hint">Constraints apply when resizing the container in Manual mode.</div>
            </>
          ) : (
            <div className="nx-vsp-hint">Scaling rules are disabled in Auto layout mode.</div>
          )}
        </div>
      </div>
    </div>
  );
}

