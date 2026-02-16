'use client';

import type { Editor } from 'tldraw';
import { Group, PenTool, ScanLine, SquaresIntersect, SquaresSubtract, SquaresUnite, Ungroup } from 'lucide-react';

export function ActionsSection({
  editor,
  selectionCount,
  showUngroup,
  showFlatten,
  showVectorize,
  onUngroup,
  onVectorize,
  onUnion,
  onSubtract,
  onIntersect,
  onFlatten,
  embedded,
}: {
  editor: Editor;
  selectionCount: number;
  showUngroup: boolean;
  showFlatten: boolean;
  showVectorize: boolean;
  onUngroup: () => void;
  onVectorize: () => void;
  onUnion: () => void;
  onSubtract: () => void;
  onIntersect: () => void;
  onFlatten: () => void;
  /** Render without outer section wrapper/title (for grouping under another header). */
  embedded?: boolean;
}) {
  const canGroup = selectionCount >= 2;
  const canBoolean = selectionCount >= 2;
  const hasAny =
    canGroup || showUngroup || showVectorize || canBoolean || showFlatten;
  if (!hasAny) return null;

  const body = (
    <div className="nx-vsp-group">
      <div className="nx-vsp-actionsGrid">
        {canGroup ? (
          <span className="nx-tooltip" data-tooltip="Group">
            <button
              type="button"
              className="nx-tlui-squarebtn"
              onClick={() => {
                try {
                  const ids = editor.getSelectedShapeIds();
                  if (ids.length >= 2) editor.groupShapes(ids);
                } catch {
                  // ignore
                }
              }}
              aria-label="Group selection"
            >
              <Group size={16} />
            </button>
          </span>
        ) : null}

        {showUngroup ? (
          <span className="nx-tooltip" data-tooltip="Ungroup">
            <button
              type="button"
              className="nx-tlui-squarebtn"
              onClick={() => {
                onUngroup();
              }}
              aria-label="Ungroup selection"
            >
              <Ungroup size={16} />
            </button>
          </span>
        ) : null}

        {showVectorize ? (
          <span className="nx-tooltip" data-tooltip="Convert to vector (points)">
            <button
              type="button"
              className="nx-tlui-squarebtn"
              onClick={() => {
                onVectorize();
              }}
              aria-label="Convert selection to vector points"
            >
              <PenTool size={16} />
            </button>
          </span>
        ) : null}

        {canBoolean ? (
          <>
            <span className="nx-tooltip" data-tooltip="Union">
              <button type="button" className="nx-tlui-squarebtn" onClick={onUnion} aria-label="Union">
                <SquaresUnite size={16} />
              </button>
            </span>
            <span className="nx-tooltip" data-tooltip="Subtract">
              <button type="button" className="nx-tlui-squarebtn" onClick={onSubtract} aria-label="Subtract">
                <SquaresSubtract size={16} />
              </button>
            </span>
            <span className="nx-tooltip" data-tooltip="Intersect">
              <button type="button" className="nx-tlui-squarebtn" onClick={onIntersect} aria-label="Intersect">
                <SquaresIntersect size={16} />
              </button>
            </span>
          </>
        ) : null}

        {showFlatten ? (
          <span className="nx-tooltip" data-tooltip="Flatten">
            <button type="button" className="nx-tlui-squarebtn" onClick={onFlatten} aria-label="Flatten">
              <ScanLine size={16} />
            </button>
          </span>
        ) : null}
      </div>
    </div>
  );

  if (embedded) return body;
  return (
    <div className="nx-vsp-section">
      <div className="nx-vsp-title">Actions</div>
      {body}
    </div>
  );
}

