import { ArrowLeft, ArrowRight, MoreHorizontal, ZoomIn, ZoomOut } from 'lucide-react';

type Props = {
  /** Whether this node has an expanded grid history (so we can show zoom controls even when collapsed). */
  hasExpandedHistory: boolean;
  /** Whether the node is currently expanded (grid visible). */
  isExpanded: boolean;
  /** Toggle expanded grid state. */
  onToggleExpanded: () => void;

  /** Whether this node has show-flow controls available (root process node). */
  hasShowFlowToggle: boolean;
  /** Whether show-flow is currently enabled. */
  isShowFlowOn: boolean;
  /** Toggle show-flow. */
  onToggleShowFlow: () => void;

  /** Whether the node is currently selected (used to keep controls visible/stable). */
  isSelected: boolean;

  /**
   * Right offset utility:
   * - When true, moves the control cluster left to avoid colliding with other right-side buttons.
   */
  shiftLeftForOtherRightButton?: boolean;
};

export function NodeInlineControls({
  hasExpandedHistory,
  isExpanded,
  onToggleExpanded,
  hasShowFlowToggle,
  isShowFlowOn,
  onToggleShowFlow,
  isSelected,
  shiftLeftForOtherRightButton,
}: Props) {
  // Nothing to render
  if (!hasExpandedHistory && !hasShowFlowToggle) return null;

  const rightClass = shiftLeftForOtherRightButton ? 'right-8' : 'right-1';

  // Only zoom
  if (hasExpandedHistory && !hasShowFlowToggle) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          onToggleExpanded();
        }}
        onMouseDown={(e) => {
          e.stopPropagation();
          e.preventDefault();
        }}
        className={`absolute ${rightClass} top-1/2 -translate-y-1/2 h-6 w-6 border flex items-center justify-center z-20 bg-white`}
        title={isExpanded ? 'Collapse expanded view' : 'Expand to grid view'}
        style={{ pointerEvents: 'auto' }}
      >
        {isExpanded ? (
          <ZoomOut size={16} />
        ) : (
          <ZoomIn size={16} />
        )}
      </button>
    );
  }

  // Only show-flow
  if (!hasExpandedHistory && hasShowFlowToggle) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          onToggleShowFlow();
        }}
        onMouseDown={(e) => {
          e.stopPropagation();
          e.preventDefault();
        }}
        className={`absolute ${rightClass} top-1/2 -translate-y-1/2 h-6 w-6 border flex items-center justify-center z-20 bg-white`}
        title={isShowFlowOn ? 'Hide flow' : 'Show flow'}
        style={{ pointerEvents: 'auto' }}
      >
        {isShowFlowOn ? (
          <ArrowLeft size={16} />
        ) : (
          <ArrowRight size={16} />
        )}
      </button>
    );
  }

  // Combined: use … and split into two buttons on hover (and stay visible when selected)
  return (
    <div className={`absolute ${rightClass} top-1/2 -translate-y-1/2 z-20`} style={{ pointerEvents: 'auto' }}>
      <div className="relative group/controls">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
          }}
          onMouseDown={(e) => {
            e.stopPropagation();
            e.preventDefault();
          }}
          className={`h-6 w-6 border flex items-center justify-center bg-white ${
            isSelected ? 'opacity-0 pointer-events-none' : 'group-hover/controls:opacity-0 group-hover/controls:pointer-events-none'
          }`}
          title="Node controls"
        >
          <MoreHorizontal size={16} />
        </button>

        <div
          className={`absolute right-0 top-1/2 -translate-y-1/2 flex flex-row gap-1 transition-opacity ${
            isSelected
              ? 'opacity-100 pointer-events-auto'
              : 'opacity-0 pointer-events-none group-hover/controls:opacity-100 group-hover/controls:pointer-events-auto'
          }`}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              onToggleExpanded();
            }}
            onMouseDown={(e) => {
              e.stopPropagation();
              e.preventDefault();
            }}
            className="h-6 w-6 border flex items-center justify-center bg-white"
            title={isExpanded ? 'Collapse expanded view' : 'Expand to grid view'}
          >
            {isExpanded ? (
              <ZoomOut size={16} />
            ) : (
              <ZoomIn size={16} />
            )}
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              onToggleShowFlow();
            }}
            onMouseDown={(e) => {
              e.stopPropagation();
              e.preventDefault();
            }}
            className="h-6 w-6 border flex items-center justify-center bg-white"
            title={isShowFlowOn ? 'Hide flow' : 'Show flow'}
          >
            {isShowFlowOn ? (
              <ArrowLeft size={16} />
            ) : (
              <ArrowRight size={16} />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

