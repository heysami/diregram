import { NexusNode } from '@/types/nexus';
import type { LayoutDirection } from '@/lib/layout-direction';
import { useCallback } from 'react';

// Returns the ID of the node to select
export function useKeyboardNavigation(
    selectedNodeId: string | null, 
    nodeMap: Map<string, NexusNode>,
    roots: NexusNode[],
    visualTree: NexusNode[], // Used for visual navigation (Arrow keys)
    layoutDirection: LayoutDirection
) {

    const navigate = useCallback((key: string, isCmd: boolean): string | null => {
        if (!selectedNodeId) return null;
        const node = nodeMap.get(selectedNodeId);
        if (!node) return null;

        // Cmd+Arrow is reserved for structural moves in NexusCanvas.
        if (isCmd) return null;

        const siblings = node.parentId ? nodeMap.get(node.parentId)!.children : visualTree;
        const idx = siblings.findIndex((s) => s.id === node.id);
        const prevSiblingId = idx > 0 ? siblings[idx - 1]?.id ?? null : null;
        const nextSiblingId = idx >= 0 && idx < siblings.length - 1 ? siblings[idx + 1]?.id ?? null : null;
        const parentId = node.parentId ?? null;
        const childId = node.children.length > 0 ? node.children[0]?.id ?? null : null;

        // Map arrow keys to the *visual* directions on screen.
        // - Horizontal: parent/child is Left/Right, siblings are Up/Down.
        // - Vertical: parent/child is Up/Down, siblings are Left/Right.
        if (layoutDirection === 'vertical') {
            if (key === 'ArrowLeft') return prevSiblingId;
            if (key === 'ArrowRight') return nextSiblingId;
            if (key === 'ArrowUp') return parentId;
            if (key === 'ArrowDown') return childId;
        } else {
            if (key === 'ArrowUp') return prevSiblingId;
            if (key === 'ArrowDown') return nextSiblingId;
            if (key === 'ArrowLeft') return parentId;
            if (key === 'ArrowRight') return childId;
        }
        
        return null;
    }, [selectedNodeId, nodeMap, visualTree, layoutDirection]);

    return { navigate };
}
