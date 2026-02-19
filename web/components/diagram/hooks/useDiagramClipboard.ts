import { useCallback } from 'react';
import type { NexusNode } from '@/types/nexus';
import { isFromEditableTarget } from '@/lib/dom/isFromEditableTarget';
import {
  isBlockedCrossFilePaste,
  readInternalClipboardEnvelope,
  writeInternalClipboardEnvelope,
} from '@/lib/nexus-internal-clipboard';

export function useDiagramClipboard(opts: {
  fileId?: string | null;
  /** Returns the node that should be used for copy/cut (selected node or focus root). */
  getSelectedNode: () => NexusNode | null;
  /** Current selected id (used for paste-onto-node). */
  selectedNodeId: string | null;
  /** Optional focused root id (used for paste-onto-node). */
  rootFocusId?: string | null;
  rawNodeMap: Map<string, NexusNode>;
  structure: {
    extractSubtreeMarkdown: (node: NexusNode, rawNodeMap: Map<string, NexusNode>, activeVariantId?: string | null) => string;
    insertSubtreeMarkdownAsChild: (
      node: NexusNode,
      rawNodeMap: Map<string, NexusNode>,
      snippet: string,
      activeVariantId?: string | null,
    ) => unknown;
    deleteSubtreeMarkdown: (node: NexusNode, rawNodeMap: Map<string, NexusNode>, activeVariantId?: string | null) => void;
  };
  insertSnippetAsNewRoot: (snippet: string) => number | null | undefined;
  setPendingAction: (action: unknown) => void;
  onSelectNode: (id: string | null) => void;
  topToast: { show: (msg: string) => void };
}) {
  const {
    fileId,
    getSelectedNode,
    selectedNodeId,
    rootFocusId,
    rawNodeMap,
    structure,
    insertSnippetAsNewRoot,
    setPendingAction,
    onSelectNode,
    topToast,
  } = opts;

  const onCopy = useCallback(
    (e: React.ClipboardEvent) => {
      if (isFromEditableTarget(e.target)) return;
      const activeFileId = String(fileId || '').trim();
      if (!activeFileId) return;
      const node = getSelectedNode();
      if (!node) return;
      const snippet = structure.extractSubtreeMarkdown(node, rawNodeMap, node.activeVariantId);
      if (!snippet.trim()) return;
      e.preventDefault();
      try {
        writeInternalClipboardEnvelope(e.nativeEvent, {
          kind: 'diagramSubtree',
          fileId: activeFileId,
          plainText: snippet,
          payload: { markdown: snippet },
        });
      } catch {
        // ignore
      }
      try {
        e.clipboardData?.setData('text/plain', snippet);
      } catch {
        // ignore
      }
    },
    [fileId, getSelectedNode, rawNodeMap, structure],
  );

  const onCut = useCallback(
    (e: React.ClipboardEvent) => {
      if (isFromEditableTarget(e.target)) return;
      const activeFileId = String(fileId || '').trim();
      if (!activeFileId) return;
      const node = getSelectedNode();
      if (!node) return;
      const snippet = structure.extractSubtreeMarkdown(node, rawNodeMap, node.activeVariantId);
      if (!snippet.trim()) return;
      e.preventDefault();
      try {
        writeInternalClipboardEnvelope(e.nativeEvent, {
          kind: 'diagramSubtree',
          fileId: activeFileId,
          plainText: snippet,
          payload: { markdown: snippet },
        });
      } catch {
        // ignore
      }
      try {
        e.clipboardData?.setData('text/plain', snippet);
      } catch {
        // ignore
      }

      try {
        structure.deleteSubtreeMarkdown(node, rawNodeMap, node.activeVariantId);
      } catch {
        // ignore
      }
      onSelectNode(null);
    },
    [fileId, getSelectedNode, onSelectNode, rawNodeMap, structure],
  );

  const onPaste = useCallback(
    (e: React.ClipboardEvent) => {
      if (isFromEditableTarget(e.target)) return;
      const activeFileId = String(fileId || '').trim();
      if (!activeFileId) return;
      const env = readInternalClipboardEnvelope(e.nativeEvent);
      if (!env || env.kind !== 'diagramSubtree') return;

      if (isBlockedCrossFilePaste(env, activeFileId)) {
        e.preventDefault();
        topToast.show(`Can't paste across different files.`);
        return;
      }

      const snippet = (() => {
        const p = env.payload as unknown;
        if (!p || typeof p !== 'object') return '';
        return String((p as Record<string, unknown>).markdown || '');
      })();
      if (!snippet.trim()) return;
      e.preventDefault();

      const effectiveSelectedId = selectedNodeId || rootFocusId || null;
      if (effectiveSelectedId) {
        const node = rawNodeMap.get(effectiveSelectedId) || null;
        if (node) {
          const action = structure.insertSubtreeMarkdownAsChild(node, rawNodeMap, snippet, node.activeVariantId);
          if (action) setPendingAction(action);
          return;
        }
      }

      const insertedLineIndex = insertSnippetAsNewRoot(snippet);
      if (typeof insertedLineIndex === 'number') {
        setPendingAction({ lineIndex: insertedLineIndex, type: 'select' } as unknown);
      }
    },
    [fileId, insertSnippetAsNewRoot, rawNodeMap, rootFocusId, selectedNodeId, setPendingAction, structure, topToast],
  );

  return { onCopy, onCut, onPaste };
}

