'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Editor } from 'tldraw';
import { ScanLine, SquaresIntersect, SquaresSubtract, SquaresUnite } from 'lucide-react';
import { createBooleanFromSelection, flattenBoolean, getFlattenInfoFromSelection } from '@/components/vision/tldraw/boolean/bundles';

export function TldrawBooleanPanel({ editor }: { editor: Editor | null }) {
  const [selectedIdsKey, setSelectedIdsKey] = useState('');

  useEffect(() => {
    if (!editor) return;
    const read = () => {
      const ids = editor.getSelectedShapeIds().map(String);
      const key = ids.join(',');
      setSelectedIdsKey((prev) => (prev === key ? prev : key));
    };
    // Initialize immediately.
    read();
    const cleanup = editor.store.listen(() => read(), { scope: 'all' as any });
    return () => {
      try {
        cleanup?.();
      } catch {
        // ignore
      }
    };
  }, [editor]);

  const selectedIds = useMemo(() => (selectedIdsKey ? selectedIdsKey.split(',').filter(Boolean) : []), [selectedIdsKey]);
  const canRun = useMemo(() => Boolean(editor && selectedIds.length >= 2), [editor, selectedIds.length]);

  const flattenInfo = useMemo(() => (editor ? getFlattenInfoFromSelection(editor, selectedIds) : null), [editor, selectedIds]);

  const flatten = async () => {
    if (!editor) return;
    const info = flattenInfo;
    if (!info) return;
    await flattenBoolean(editor, info);
  };

  return (
    <div className="space-y-2">
      <div className="text-sm font-semibold">Boolean</div>
      <div className="flex items-center gap-2">
        <span className="nx-tooltip" data-tooltip="Union">
          <button
            type="button"
            className="nx-tlui-squarebtn"
            disabled={!canRun}
            onClick={() => editor && createBooleanFromSelection(editor, 'union').catch(() => {})}
            aria-label="Union"
          >
            <SquaresUnite size={16} />
          </button>
        </span>
        <span className="nx-tooltip" data-tooltip="Subtract">
          <button
            type="button"
            className="nx-tlui-squarebtn"
            disabled={!canRun}
            onClick={() => editor && createBooleanFromSelection(editor, 'subtract').catch(() => {})}
            aria-label="Subtract"
          >
            <SquaresSubtract size={16} />
          </button>
        </span>
        <span className="nx-tooltip" data-tooltip="Intersect">
          <button
            type="button"
            className="nx-tlui-squarebtn"
            disabled={!canRun}
            onClick={() => editor && createBooleanFromSelection(editor, 'intersect').catch(() => {})}
            aria-label="Intersect"
          >
            <SquaresIntersect size={16} />
          </button>
        </span>
        <span className="nx-tooltip" data-tooltip="Flatten">
          <button
            type="button"
            className="nx-tlui-squarebtn"
            disabled={!flattenInfo}
            onClick={() => flatten().catch(() => {})}
            aria-label="Flatten"
          >
            <ScanLine size={16} />
          </button>
        </span>
      </div>
    </div>
  );
}

