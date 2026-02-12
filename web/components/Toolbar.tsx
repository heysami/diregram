import { ArrowUpRight, Eye, Highlighter, MessageSquareText, MousePointer2, Redo2, Settings2, Square, SquareDashed, Trash2, Undo2 } from 'lucide-react';
import { useState } from 'react';
import * as Y from 'yjs';
import type { TagViewState } from '@/types/tagging';
import { TagViewPopover } from '@/components/tagging/TagViewPopover';
import { TagManagerModal } from '@/components/tagging/TagManagerModal';

export type ToolType = 'select' | 'node' | 'line' | 'comment' | 'annotation';

interface Props {
  doc: Y.Doc;
  activeTool: ToolType;
  onToolChange: (tool: ToolType) => void;
  mainLevel: number;
  onMainLevelChange: (level: number) => void;
  tagView: TagViewState;
  onTagViewChange: (next: TagViewState | ((prev: TagViewState) => TagViewState)) => void;
  showComments: boolean;
  onShowCommentsChange: (next: boolean) => void;
  showAnnotations: boolean;
  onShowAnnotationsChange: (next: boolean) => void;
  variant?: 'full' | 'notesOnly';
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  systemFlowTools?: {
    onAddBox: () => void;
    onToggleLinkMode: () => void;
    onCreateZone: () => void;
    onDeleteSelection: () => void;
  } | null;
}

export function Toolbar({
  doc,
  activeTool,
  onToolChange,
  mainLevel,
  onMainLevelChange,
  tagView,
  onTagViewChange,
  showComments,
  onShowCommentsChange,
  showAnnotations,
  onShowAnnotationsChange,
  variant = 'full',
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
  systemFlowTools = null,
}: Props) {
  const [showSettings, setShowSettings] = useState(false);
  const [showTagEye, setShowTagEye] = useState(false);
  const [showTagManager, setShowTagManager] = useState(false);

  const showFullTools = variant === 'full';

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 z-50">
      
      {showFullTools && showSettings && (
          <div className="mac-window mb-2 animate-in fade-in slide-in-from-bottom-2">
            <div className="mac-titlebar">
              <div className="mac-title">Settings</div>
            </div>
            <div className="mac-toolstrip">
              <span className="text-[12px] font-bold">Main Level</span>
              <div className="flex items-center">
                  <button 
                    onClick={() => onMainLevelChange(Math.max(0, mainLevel - 1))}
                    className="mac-btn"
                  >-</button>
                  <span className="px-2 text-[12px] font-mono w-10 text-center">{mainLevel}</span>
                  <button 
                    onClick={() => onMainLevelChange(mainLevel + 1)}
                    className="mac-btn"
                  >+</button>
              </div>
            </div>
          </div>
      )}

      {showFullTools && showTagEye ? (
        <TagViewPopover doc={doc} tagView={tagView} onTagViewChange={onTagViewChange} onOpenManager={() => setShowTagManager(true)} />
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
              label="Select (V)"
            />
            <ToolButton 
              isActive={activeTool === 'node'} 
              onClick={() => onToolChange('node')}
              icon={<Square size={18} />}
              label="Node (R)"
            />
            <ToolButton 
              isActive={activeTool === 'line'} 
              onClick={() => onToolChange('line')}
              icon={<ArrowUpRight size={18} />}
              label="Line (L)"
            />
          </>
        ) : null}

        {/* Comment + Annotation tools (always separate) */}
        <ToolButton
          isActive={activeTool === 'comment'}
          onClick={() => onToolChange(activeTool === 'comment' ? 'select' : 'comment')}
          icon={<MessageSquareText size={18} />}
          label="Comment (C)"
        />
        <ToolButton
          isActive={activeTool === 'annotation'}
          onClick={() => onToolChange(activeTool === 'annotation' ? 'select' : 'annotation')}
          icon={<Highlighter size={18} />}
          label="Annotation (A)"
        />

        {/* System Flow quick add tools (optional) */}
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

        {/* Visibility toggles */}
        <div className="mac-sep" />
        <ToolButton
          isActive={showComments}
          onClick={() => onShowCommentsChange(!showComments)}
          icon={<MessageSquareText size={18} />}
          label={showComments ? 'Hide comments' : 'Show comments'}
        />
        <ToolButton
          isActive={showAnnotations}
          onClick={() => onShowAnnotationsChange(!showAnnotations)}
          icon={<Highlighter size={18} />}
          label={showAnnotations ? 'Hide annotations' : 'Show annotations'}
        />
        
        {showFullTools ? (
          <>
            <div className="mac-sep" />
            
            <ToolButton 
              isActive={showSettings} 
              onClick={() => setShowSettings(!showSettings)}
              icon={<Settings2 size={18} />}
              label="Settings"
            />

            <ToolButton
              isActive={showTagEye}
              onClick={() => setShowTagEye(!showTagEye)}
              icon={<Eye size={18} />}
              label="Tag view"
            />
          </>
        ) : null}
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
