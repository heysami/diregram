'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Editor, TLParentId, TLShape, TLShapeId } from 'tldraw';
import { getIndexBetween, getIndexBelow, getIndexAbove, type IndexKey } from '@tldraw/utils';
import { ChevronDown, ChevronRight, Eye, EyeOff, Lock, Unlock } from 'lucide-react';

type LayerNode = {
  id: TLShapeId;
  shape: TLShape;
  children: LayerNode[];
};

// UX: show "higher layers" (frontmost) at the top of the list.
const DISPLAY_FRONT_TO_BACK = true;

function isGroupLike(shape: TLShape): boolean {
  // tldraw groups are explicit, but frames also parent other shapes.
  return shape.type === 'group' || shape.type === 'frame';
}

function getName(shape: TLShape): string {
  const m: any = shape.meta || {};
  if (typeof m.nxName === 'string' && m.nxName.trim()) return m.nxName.trim();
  // Fallbacks for common shapes.
  if (shape.type === 'text') {
    const p: any = shape.props || {};
    if (typeof p.text === 'string' && p.text.trim()) return p.text.trim().slice(0, 48);
  }
  return shape.type;
}

function getParentShapeId(parentId: TLParentId): TLShapeId | null {
  const s = String(parentId);
  return s.startsWith('shape:') ? (s.slice('shape:'.length) as TLShapeId) : null;
}

function buildTree(editor: Editor): LayerNode[] {
  const pageId = editor.getCurrentPageId();
  const walk = (parent: TLParentId | TLShapeId): LayerNode[] => {
    const ids = editor.getSortedChildIdsForParent(parent as any);
    const nodes: LayerNode[] = [];
    for (const id of ids) {
      const shape = editor.getShape(id);
      if (!shape) continue;
      nodes.push({
        id,
        shape,
        children: isGroupLike(shape) ? walk(id) : [],
      });
    }
    return nodes;
  };
  return walk(pageId);
}

function computeInsertIndex(
  editor: Editor,
  parent: TLParentId | TLShapeId,
  targetId: TLShapeId,
  place: 'before' | 'after',
  movingId?: TLShapeId | null
): IndexKey | undefined {
  // When moving within the same parent, ignore the moving id when computing neighbors.
  const ids = editor.getSortedChildIdsForParent(parent as any).filter((id) => id !== movingId);
  const idx = ids.indexOf(targetId);
  if (idx < 0) return undefined;
  const target = editor.getShape(targetId);
  if (!target) return undefined;
  const prevId = ids[idx - 1] || null;
  const nextId = ids[idx + 1] || null;
  const prev = prevId ? editor.getShape(prevId) : null;
  const next = nextId ? editor.getShape(nextId) : null;

  if (place === 'before') {
    const below = prev?.index ?? null;
    const above = (target as any).index ?? null;
    if (below && above) return getIndexBetween(below, above);
    if (above) return getIndexBelow(above);
    return undefined;
  } else {
    const below = (target as any).index ?? null;
    const above = next?.index ?? null;
    if (below && above) return getIndexBetween(below, above);
    if (below) return getIndexAbove(below);
    return undefined;
  }
}

export function TldrawLayersPanel({ editor }: { editor: Editor | null }) {
  const [docRev, setDocRev] = useState(0);
  const [selectedIds, setSelectedIds] = useState<TLShapeId[]>([]);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const dragIdRef = useRef<TLShapeId | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: TLShapeId; place: 'before' | 'after' } | null>(null);
  const [renamingId, setRenamingId] = useState<TLShapeId | null>(null);
  const [renameDraft, setRenameDraft] = useState('');

  useEffect(() => {
    if (!editor) return;
    let raf: number | null = null;
    let pending = false;
    const cleanup = editor.store.listen(
      () => {
        if (pending) return;
        pending = true;
        raf = window.requestAnimationFrame(() => {
          pending = false;
          setDocRev((v) => v + 1);
        });
      },
      { scope: 'document' as any }
    );
    return () => {
      try {
        cleanup?.();
      } catch {
        // ignore
      }
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, [editor]);

  // Keep selection highlight in sync with tldraw selection (selection lives in session, not document).
  useEffect(() => {
    if (!editor) return;
    const lastKeyRef = { current: '' };
    const read = () => {
      const ids = editor.getSelectedShapeIds();
      const key = ids.join(',');
      if (key === lastKeyRef.current) return;
      lastKeyRef.current = key;
      setSelectedIds(ids);
    };
    // Initialize immediately.
    try {
      lastKeyRef.current = editor.getSelectedShapeIds().join(',');
      setSelectedIds(editor.getSelectedShapeIds());
    } catch {
      setSelectedIds([]);
    }
    const cleanup = editor.store.listen(
      () => {
        read();
      },
      // Use `all` but only set state when selection actually changes.
      { scope: 'all' as any }
    );
    return () => {
      try {
        cleanup?.();
      } catch {
        // ignore
      }
    };
  }, [editor]);

  const selected = useMemo(() => {
    if (!editor) return new Set<string>();
    return new Set(selectedIds.map(String));
  }, [editor, selectedIds]);

  const nodes = useMemo(() => {
    if (!editor) return [];
    return buildTree(editor);
  }, [editor, docRev]);

  const toggleHidden = (shape: TLShape) => {
    if (!editor) return;
    const hidden = Boolean((shape.meta as any)?.hidden);
    editor.updateShapes([
      {
        id: shape.id,
        type: shape.type,
        meta: { ...(shape.meta as any), hidden: !hidden },
      } as any,
    ]);
  };

  const toggleLock = (id: TLShapeId) => {
    if (!editor) return;
    try {
      editor.toggleLock([id]);
    } catch {
      // ignore
    }
  };

  const beginRename = (shape: TLShape) => {
    setRenamingId(shape.id);
    setRenameDraft(getName(shape));
  };

  const commitRename = () => {
    if (!editor) return;
    const id = renamingId;
    if (!id) return;
    const shape = editor.getShape(id);
    if (!shape) {
      setRenamingId(null);
      return;
    }
    editor.updateShapes([
      {
        id,
        type: shape.type,
        meta: { ...(shape.meta as any), nxName: renameDraft.trim() || undefined },
      } as any,
    ]);
    setRenamingId(null);
  };

  const onDropOnRow = (target: TLShape) => {
    if (!editor) return;
    const movingId = dragIdRef.current;
    dragIdRef.current = null;
    setDropTarget(null);
    if (!movingId) return;
    if (movingId === target.id) return;

    const moving = editor.getShape(movingId);
    if (!moving) return;

    const targetParent = target.parentId;
    const uiPlace = dropTarget?.place || 'before';
    const place = DISPLAY_FRONT_TO_BACK ? (uiPlace === 'before' ? 'after' : 'before') : uiPlace;
    const insertIndex = computeInsertIndex(editor, targetParent, target.id, place, movingId);
    try {
      editor.reparentShapes([movingId], targetParent, insertIndex);
      editor.setSelectedShapes([movingId]);
    } catch {
      // ignore
    }
  };

  const onDropOnGroup = (group: TLShape) => {
    if (!editor) return;
    const movingId = dragIdRef.current;
    dragIdRef.current = null;
    setDropTarget(null);
    if (!movingId) return;
    if (movingId === group.id) return;

    // Append to end of group.
    const lastIndex = editor.getHighestIndexForParent(group.id);
    const insertIndex = getIndexAbove(lastIndex);
    try {
      editor.reparentShapes([movingId], group.id, insertIndex);
      editor.setSelectedShapes([movingId]);
      setOpen((m) => ({ ...m, [String(group.id)]: true }));
    } catch {
      // ignore
    }
  };

  const renderNode = (n: LayerNode, depth: number) => {
    const isOpen = open[String(n.id)] ?? true;
    const isSelected = selected.has(String(n.id));
    const hidden = Boolean((n.shape.meta as any)?.hidden);
    const parentShapeId = getParentShapeId(n.shape.parentId);
    const parentLocked = parentShapeId ? editor?.isShapeOrAncestorLocked(parentShapeId) : false;
    const locked = Boolean(editor?.isShapeOrAncestorLocked(n.id)) || Boolean(parentLocked);
    const groupLike = isGroupLike(n.shape);
    const isDropTarget = dropTarget?.id === n.id;
    const dropPlace = dropTarget?.place || 'before';

    return (
      <div key={String(n.id)}>
        <div
          className={[
            'nx-tlui-row group',
            isSelected ? 'nx-tlui-row--selected' : '',
            isDropTarget ? 'nx-tlui-row--drop' : '',
          ].join(' ')}
          style={{ marginLeft: depth * 10 }}
          draggable={!locked && renamingId !== n.id}
          onDragStart={(e) => {
            if (locked) return;
            dragIdRef.current = n.id;
            try {
              e.dataTransfer.setData('text/plain', String(n.id));
              e.dataTransfer.effectAllowed = 'move';
            } catch {
              // ignore
            }
          }}
          onDragEnd={() => {
            dragIdRef.current = null;
            setDropTarget(null);
          }}
          onDragOver={(e) => {
            if (locked) return;
            e.preventDefault();
            // Decide before/after based on cursor position.
            const r = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
            const place: 'before' | 'after' = e.clientY < r.top + r.height / 2 ? 'before' : 'after';
            setDropTarget({ id: n.id, place });
            try {
              e.dataTransfer.dropEffect = 'move';
            } catch {
              // ignore
            }
          }}
          onDrop={(e) => {
            e.preventDefault();
            onDropOnRow(n.shape);
          }}
          onClick={() => {
            if (!editor) return;
            editor.setSelectedShapes([n.id]);
          }}
          onDoubleClick={() => beginRename(n.shape)}
          title={String(n.id)}
        >
          {/* Drop insertion indicator (between rows) */}
          {isDropTarget ? (
            <div
              className={[
                'nx-tlui-drop-line',
                dropPlace === 'before' ? 'top-[2px]' : 'bottom-[2px]',
              ].join(' ')}
            />
          ) : null}

          {groupLike ? (
            <button
              type="button"
              className="nx-tlui-iconbtn"
              onClick={(e) => {
                e.stopPropagation();
                setOpen((m) => ({ ...m, [String(n.id)]: !(m[String(n.id)] ?? true) }));
              }}
              title={isOpen ? 'Collapse' : 'Expand'}
            >
              {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
          ) : (
            <div className="w-[14px]" />
          )}

          <div className="flex-1 text-xs truncate min-w-0">
            {renamingId === n.id ? (
              <input
                className="nx-tlui-input"
                value={renameDraft}
                autoFocus
                onFocus={(e) => e.currentTarget.select()}
                onChange={(e) => setRenameDraft(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === 'Enter') commitRename();
                  if (e.key === 'Escape') setRenamingId(null);
                }}
              />
            ) : (
              getName(n.shape)
            )}
          </div>

          {/* Right-side actions: only show on hover, or if currently locked/hidden */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              className={[
                'nx-tlui-iconbtn transition-opacity',
                hidden ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto',
              ].join(' ')}
              onClick={(e) => {
                e.stopPropagation();
                toggleHidden(n.shape);
              }}
              title={hidden ? 'Show' : 'Hide'}
            >
              {hidden ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
            <button
              type="button"
              className={[
                'nx-tlui-iconbtn transition-opacity',
                locked ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto',
              ].join(' ')}
              onClick={(e) => {
                e.stopPropagation();
                toggleLock(n.id);
              }}
              title={locked ? 'Unlock' : 'Lock'}
            >
              {locked ? <Lock size={14} /> : <Unlock size={14} />}
            </button>
          </div>
        </div>

        {groupLike && isOpen ? (
          <div>
            {(DISPLAY_FRONT_TO_BACK ? n.children.slice().reverse() : n.children).map((c) => renderNode(c, depth + 1))}
          </div>
        ) : null}
      </div>
    );
  };

  if (!editor) {
    return (
      <div className="text-xs opacity-70">
        Loading editor…
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold flex items-center gap-2">
          <span>Layers</span>
          <span className="text-[11px] opacity-60">({nodes.length})</span>
        </div>
      </div>

      <div className="space-y-1 max-h-[320px] overflow-auto pr-1">
        {(DISPLAY_FRONT_TO_BACK ? nodes.slice().reverse() : nodes).map((n) => renderNode(n, 0))}
      </div>
    </div>
  );
}

