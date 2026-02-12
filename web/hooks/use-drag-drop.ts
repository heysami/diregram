import { NexusNode } from '@/types/nexus';
import * as Y from 'yjs';

export function useDragDrop(doc: Y.Doc, nodeMap: Map<string, NexusNode>) {
    
    const validateDrop = (draggedId: string | null, targetId: string): boolean => {
        if (!draggedId || draggedId === targetId) return false;
        
        let current = nodeMap.get(targetId);
        while(current?.parentId) {
            if (current.parentId === draggedId) return false;
            current = nodeMap.get(current.parentId);
        }
        return true;
    };

    const performMove = (sourceId: string, targetId: string) => {
        const sourceNode = nodeMap.get(sourceId);
        const targetNode = nodeMap.get(targetId);
        if (!sourceNode || !targetNode) return;

        const yText = doc.getText('nexus');
        const text = yText.toString();
        const lines = text.split('\n');

        let maxLineIndex = sourceNode.lineIndex;
        const findMaxLine = (node: NexusNode) => {
            maxLineIndex = Math.max(maxLineIndex, node.lineIndex);
            node.children.forEach(findMaxLine);
        }
        findMaxLine(sourceNode);
        
        const sourceLines = lines.slice(sourceNode.lineIndex, maxLineIndex + 1);
        
        let insertAfterLine = targetNode.lineIndex;
        const findInsertLine = (node: NexusNode) => {
            insertAfterLine = Math.max(insertAfterLine, node.lineIndex);
            node.children.forEach(findInsertLine);
        }
        findInsertLine(targetNode);
        
        const sourceLevel = sourceNode.level;
        const targetLevel = targetNode.level;
        const levelDiff = (targetLevel + 1) - sourceLevel;
        
        const adjustedLines = sourceLines.map(line => {
            const match = line.match(/^(\s*)(.*)/);
            if (!match) return line;
            
            const currentIndent = match[1].length;
            const content = match[2];
            let newIndent = currentIndent + (levelDiff * 2);
            if (newIndent < 0) newIndent = 0;
            
            return ' '.repeat(newIndent) + content;
        });
        
        const linesWithoutSource = [...lines];
        linesWithoutSource.splice(sourceNode.lineIndex, sourceLines.length);
        
        let actualInsertIndex = insertAfterLine + 1;
        if (sourceNode.lineIndex < actualInsertIndex) {
            actualInsertIndex -= sourceLines.length;
        }
        
        linesWithoutSource.splice(actualInsertIndex, 0, ...adjustedLines);
        
        const newText = linesWithoutSource.join('\n');
        if (yText.toString() !== newText) {
           doc.transact(() => {
              yText.delete(0, yText.length);
              yText.insert(0, newText);
           });
        }
    };

    return { validateDrop, performMove };
}
