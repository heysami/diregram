import { ArrowUpRight, Eye, Highlighter, MessageSquareText, MousePointer2, Move, Pencil, Pin, Plus, Redo2, Settings2, Square, SquareDashed, Trash2, Undo2, ZoomIn, ZoomOut } from 'lucide-react';
import { useMemo, useState } from 'react';
import * as Y from 'yjs';
import type { TagViewState } from '@/types/tagging';
import { TagViewPopover } from '@/components/tagging/TagViewPopover';
import { TagManagerModal } from '@/components/tagging/TagManagerModal';
import { PinnedTagsPopover } from '@/components/tagging/PinnedTagsPopover';
import { useTagStore } from '@/hooks/use-tag-store';
import type { LayoutDirection } from '@/lib/layout-direction';

export type ToolType = 'select' | 'node' | 'line' | 'comment' | 'annotation';

interface Props {
  doc: Y.Doc;
  activeTool: ToolType;
  onToolChange: (tool: ToolType) => void;
  layoutDirection?: LayoutDirection;
  onLayoutDirectionChange?: (next: LayoutDirection) => void;
  mainLevel: number;
  onMainLevelChange: (level: number) => void;
  tagView: TagViewState;
  onTagViewChange: (next: TagViewState | ((prev: TagViewState) => TagViewState)) => void;
  pinnedTagIds: string[];
  onPinnedTagIdsChange: (next: string[]) => void;
  showComments: boolean;
  onShowCommentsChange: (next: boolean) => void;
  showAnnotations: boolean;
  onShowAnnotationsChange: (next: boolean) => void;
  variant?: 'full' | 'notesOnly';
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onCenterView?: () => void;
  centerTooltip?: string;
  systemFlowTools?: {
    onAddBox: () => void;
    onToggleLinkMode: () => void;
    onCreateZone: () => void;
    onDeleteSelection: () => void;
  } | null;
  dataObjectsTools?: {
    onNew: () => void;
    onOpenManage: () => void;
    onZoomIn: () => void;
    onZoomOut: () => void;
  } | null;
}

export function Toolbar({
  doc,
  activeTool,
  onToolChange,
  layoutDirection = 'horizontal',
  onLayoutDirectionChange,
  mainLevel,
  onMainLevelChange,
  tagView,
  onTagViewChange,
  pinnedTagIds,
  onPinnedTagIdsChange,
  showComments,
  onShowCommentsChange,
  showAnnotations,
  onShowAnnotationsChange,
  variant = 'full',
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
  onCenterView,
  centerTooltip,
  systemFlowTools = null,
  dataObjectsTools = null,
}: Props) {
  const [showSettings, setShowSettings] = useState(false);
  const [showTagEye, setShowTagEye] = useState(false);
  const [showTagManager, setShowTagManager] = useState(false);
  const [showPinnedTags, setShowPinnedTags] = useState(false);

  // Keep tag store wired so popovers remain fast to open.
  const tagStore = useTagStore(doc);
  void tagStore;

  const showFullTools = variant === 'full';

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 z-50">
      
      {showSettings && (
        <div className="mac-window mb-2 animate-in fade-in slide-in-from-bottom-2">
          <div className="mac-titlebar">
            <div className="mac-title">Settings</div>
          </div>
          <div className="mac-toolstrip flex flex-col gap-2 items-stretch">
            {showFullTools ? (
              <div className="flex items-center gap-2">
                <span className="text-[12px] font-bold">Main Level</span>
                <div className="flex items-center">
                  <button onClick={() => onMainLevelChange(Math.max(0, mainLevel - 1))} className="mac-btn">
                    -
                  </button>
                  <span className="px-2 text-[12px] font-mono w-10 text-center">{mainLevel}</span>
                  <button onClick={() => onMainLevelChange(mainLevel + 1)} className="mac-btn">
                    +
                  </button>
                </div>
              </div>
            ) : null}

            {showFullTools && onLayoutDirectionChange ? (
              <div className="flex items-center justify-between gap-3">
                <span className="text-[12px] font-bold">Layout</span>
                <select
                  className="mac-field h-7"
                  value={layoutDirection}
                  onChange={(e) => onLayoutDirectionChange(e.target.value === 'vertical' ? 'vertical' : 'horizontal')}
                  title="Canvas layout direction (per file)"
                >
                  <option value="horizontal">Left → Right</option>
                  <option value="vertical">Top → Down</option>
                </select>
              </div>
            ) : null}

            <div className="flex items-center justify-between gap-3">
              <span className="text-[12px] font-bold">Visibility</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className={`mac-btn ${showComments ? 'mac-btn--primary' : ''}`}
                  onClick={() => onShowCommentsChange(!showComments)}
                  title={showComments ? 'Hide comments' : 'Show comments'}
                >
                  Comments
                </button>
                <button
                  type="button"
                  className={`mac-btn ${showAnnotations ? 'mac-btn--primary' : ''}`}
                  onClick={() => onShowAnnotationsChange(!showAnnotations)}
                  title={showAnnotations ? 'Hide annotations' : 'Show annotations'}
                >
                  Annotations
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showFullTools && showTagEye ? (
        <TagViewPopover doc={doc} tagView={tagView} onTagViewChange={onTagViewChange} onOpenManager={() => setShowTagManager(true)} />
      ) : null}

      {showPinnedTags ? (
        <PinnedTagsPopover doc={doc} pinnedTagIds={pinnedTagIds} onPinnedTagIdsChange={onPinnedTagIdsChange} />
      ) : null}

      {showFullTools ? (
        <TagManagerModal doc={doc} isOpen={showTagManager} onClose={() => setShowTagManager(false)} />
      ) : null}

      <div className="mac-window">
        <div className="mac-titlebar">
          <div className="mac-title">Tools</div>
        </div>
        <div className="mac-toolstrip">
        {/* Undo / Redo */}
        {showFullTools ? (
          <>
            <ToolButton
              isActive={false}
              onClick={onUndo ? onUndo : () => {}}
              icon={<Undo2 size={18} />}
              label="Undo (⌘/Ctrl+Z)"
              disabled={!onUndo || !canUndo}
            />
            <ToolButton
              isActive={false}
              onClick={onRedo ? onRedo : () => {}}
              icon={<Redo2 size={18} />}
              label="Redo (⌘/Ctrl+Shift+Z)"
              disabled={!onRedo || !canRedo}
            />
            <div className="mac-sep" />
          </>
        ) : null}

        {showFullTools ? (
          <>
            <ToolButton 
              isActive={activeTool === 'select'} 
              onClick={() => onToolChange('select')}
              icon={<MousePointer2 size={18} />}
              label="Select"
            />
            <ToolButton 
              isActive={activeTool === 'node'} 
              onClick={() => onToolChange('node')}
              icon={<Square size={18} />}
              label="Node"
            />
            <ToolButton 
              isActive={activeTool === 'line'} 
              onClick={() => onToolChange('line')}
              icon={<ArrowUpRight size={18} />}
              label="Line"
            />
          </>
        ) : null}

        {/* Comment + Annotation tools (always separate) */}
        <ToolButton
          isActive={activeTool === 'comment'}
          onClick={() => onToolChange(activeTool === 'comment' ? 'select' : 'comment')}
          icon={<MessageSquareText size={18} />}
          label="Comment"
        />
        <ToolButton
          isActive={activeTool === 'annotation'}
          onClick={() => onToolChange(activeTool === 'annotation' ? 'select' : 'annotation')}
          icon={<Highlighter size={18} />}
          label="Annotation"
        />

        {/* Tech Flow quick add tools (optional) */}
        {systemFlowTools ? (
          <>
            <div className="mac-sep" />
            <ToolButton
              isActive={false}
              onClick={systemFlowTools.onAddBox}
              icon={<Square size={18} />}
              label="Add box"
            />
            <ToolButton
              isActive={false}
              onClick={systemFlowTools.onToggleLinkMode}
              icon={<ArrowUpRight size={18} />}
              label="Link mode"
            />
            <ToolButton
              isActive={false}
              onClick={systemFlowTools.onCreateZone}
              icon={<SquareDashed size={18} />}
              label="Create zone from selection"
            />
            <ToolButton
              isActive={false}
              onClick={systemFlowTools.onDeleteSelection}
              icon={<Trash2 size={18} />}
              label="Delete selection"
            />
          </>
        ) : null}

        {/* Data Objects tools (optional) */}
        {dataObjectsTools ? (
          <>
            <div className="mac-sep" />
            <ToolButton
              isActive={false}
              onClick={dataObjectsTools.onNew}
              icon={<Plus size={18} />}
              label="New data object"
            />
            <ToolButton
              isActive={false}
              onClick={dataObjectsTools.onOpenManage}
              icon={<Pencil size={18} />}
              label="Manage objects"
            />
            <ToolButton
              isActive={false}
              onClick={dataObjectsTools.onZoomIn}
              icon={<ZoomIn size={18} />}
              label="Zoom in"
            />
            <ToolButton
              isActive={false}
              onClick={dataObjectsTools.onZoomOut}
              icon={<ZoomOut size={18} />}
              label="Zoom out"
            />
          </>
        ) : null}

        <div className="mac-sep" />
        {showFullTools ? (
          <ToolButton isActive={showTagEye} onClick={() => setShowTagEye(!showTagEye)} icon={<Eye size={18} />} label="Tag view" />
        ) : null}
        <ToolButton
          isActive={showPinnedTags}
          onClick={() => setShowPinnedTags(!showPinnedTags)}
          icon={<Pin size={18} />}
          label="Pinned tags"
        />

        <div className="mac-sep" />
        <ToolButton isActive={showSettings} onClick={() => setShowSettings(!showSettings)} icon={<Settings2 size={18} />} label="Settings" />

        {/* View controls */}
        <div className="mac-sep" />
        <ToolButton
          isActive={false}
          onClick={onCenterView ? onCenterView : () => {}}
          icon={<Move size={18} />}
          label={`Center view${centerTooltip ? ` — ${centerTooltip}` : ''}`}
          disabled={!onCenterView}
        />
        </div>
      </div>
    </div>
  );
}

function ToolButton({ isActive, onClick, icon, label, disabled }: any) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`mac-toolbtn relative group ${isActive ? 'is-active' : ''} ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
      title={label}
    >
      {icon}
      <span className="mac-tooltip absolute -top-10 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
        {label}
      </span>
    </button>
  );
}
