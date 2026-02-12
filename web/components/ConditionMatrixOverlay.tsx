import { X } from 'lucide-react';
import { ConditionMatrixScenario } from '@/lib/condition-matrix';
import { NexusNode } from '@/types/nexus';
import { NodeLayout } from '@/lib/layout-engine';

interface Props {
  open: boolean;
  title?: string;
  hubLabel: string;
  scenarios: ConditionMatrixScenario[];
  onClose: () => void;
  onSelectScenario: (scenario: ConditionMatrixScenario) => void;
}

/**
 * Shared, read-only Condition Matrix overlay.
 * Used by both LogicPanel and NexusCanvas so the behaviour and visuals stay in sync.
 */
export function ConditionMatrixOverlay({
  open,
  title = 'Condition Matrix',
  hubLabel,
  scenarios,
  onClose,
  onSelectScenario,
}: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center">
      <div className="mac-window max-w-6xl w-[92vw] max-h-[88vh] flex flex-col">
        <div className="mac-titlebar">
          <div className="mac-title">{title}</div>
          <div className="absolute right-1 top-1/2 -translate-y-1/2">
            <button type="button" onClick={onClose} className="mac-btn" title="Close">
              <X size={14} />
            </button>
          </div>
        </div>

        <div className="p-4 overflow-auto flex-1">
          <div className="mb-3 text-[12px] font-bold truncate">{hubLabel}</div>
          {scenarios.length === 0 ? (
            <div className="h-full flex items-center justify-center">
              <div className="text-xs mac-double-outline mac-fill--dots-1 px-4 py-6">
                No variants or children defined yet for this hub.
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {scenarios.map((scenario) => {
                const hasChildren = scenario.hasChildren;
                return (
                  <button
                    key={scenario.id}
                    type="button"
                    onClick={() => onSelectScenario(scenario)}
                    className={`text-left mac-double-outline p-3 transition-all hover:[box-shadow:4px_4px_0_#000] focus:[box-shadow:4px_4px_0_#000] ${
                      hasChildren ? 'bg-white' : 'mac-fill--dots-1'
                    }`}
                  >
                    <div className="text-[11px] font-semibold mb-2">
                      {scenario.label}
                    </div>
                    {hasChildren ? (
                      <div className="mac-fill--dots-1 mac-double-outline h-40 overflow-hidden relative">
                        <div
                          className="absolute top-0 left-0 pointer-events-none"
                          style={{
                            width: 260,
                            height: 160,
                            transform: `translate(${scenario.offsetX}px, ${scenario.offsetY}px) scale(${scenario.scale})`,
                            transformOrigin: 'top left',
                          }}
                        >
                          <svg className="absolute top-0 left-0 w-[1000px] h-[1000px] pointer-events-none overflow-visible">
                            {scenario.nodes.map((n: NexusNode) => {
                              if (!n.parentId) return null;
                              const parentLayout: NodeLayout | undefined = scenario.layout[n.parentId];
                              const childLayout: NodeLayout | undefined = scenario.layout[n.id];
                              if (!parentLayout || !childLayout) return null;

                              const startX = parentLayout.x + parentLayout.width;
                              const startY = parentLayout.y + parentLayout.height / 2;
                              const endX = childLayout.x;
                              const endY = childLayout.y + childLayout.height / 2;
                              const c1x = startX + (endX - startX) / 2;

                              return (
                                <path
                                  key={`${n.parentId}-${n.id}`}
                                  d={`M ${startX} ${startY} C ${c1x} ${startY}, ${c1x} ${endY}, ${endX} ${endY}`}
                                  stroke="#000000"
                                  strokeWidth="1.5"
                                  fill="none"
                                />
                              );
                            })}
                          </svg>
                          {scenario.nodes.map((n: NexusNode) => {
                            const l: NodeLayout | undefined = scenario.layout[n.id];
                            if (!l) return null;
                            return (
                              <div
                                key={n.id}
                                className="absolute bg-white mac-double-outline px-1.5 py-0.5 text-[10px] flex items-center justify-center truncate"
                                style={{
                                  left: l.x,
                                  top: l.y,
                                  width: l.width,
                                  height: l.height,
                                }}
                              >
                                {n.content}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <div className="mac-fill--dots-2 mac-double-outline px-2 py-4 text-[11px] opacity-60 text-center">
                        Empty – no children for this combination
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

