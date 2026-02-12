import { NexusNode } from '@/types/nexus';
import { useCallback } from 'react';

// Returns the ID of the node to select
export function useKeyboardNavigation(
    selectedNodeId: string | null, 
    nodeMap: Map<string, NexusNode>,
    roots: NexusNode[],
    visualTree: NexusNode[] // Used for visual navigation (Arrow keys)
) {

    const navigate = useCallback((key: string, isCmd: boolean): string | null => {
        if (!selectedNodeId) return null;
        const node = nodeMap.get(selectedNodeId);
        if (!node) return null;

        if (key === 'ArrowUp') {
            if (isCmd) return null; // Cmd+Up handled by structure hook
            const siblings = node.parentId ? nodeMap.get(node.parentId)!.children : visualTree;
            const idx = siblings.findIndex(s => s.id === node.id);
            if (idx > 0) return siblings[idx - 1].id;
        }
        else if (key === 'ArrowDown') {
            if (isCmd) return null;
            const siblings = node.parentId ? nodeMap.get(node.parentId)!.children : visualTree;
            const idx = siblings.findIndex(s => s.id === node.id);
            if (idx < siblings.length - 1) return siblings[idx + 1].id;
        }
        else if (key === 'ArrowLeft') {
            if (isCmd) return null;
            if (node.parentId) return node.parentId;
        }
        else if (key === 'ArrowRight') {
            if (isCmd) return null;
            if (node.children.length > 0) return node.children[0].id;
        }
        
        return null;
    }, [selectedNodeId, nodeMap, visualTree]);

    return { navigate };
}
