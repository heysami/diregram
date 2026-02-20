export const DATAOBJECTS_TOOL_EVENT = 'diregram:dataobjectsTool' as const;

export type DataObjectsTool = 'new' | 'manage' | 'zoomIn' | 'zoomOut' | 'center';

export type DataObjectsToolEventDetail = { tool?: DataObjectsTool };

export function dispatchDataObjectsTool(tool: DataObjectsTool) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<DataObjectsToolEventDetail>(DATAOBJECTS_TOOL_EVENT, { detail: { tool } }));
}

