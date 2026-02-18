'use client';

import { Download, Package, Share2, Trash2 } from 'lucide-react';
import { EditorMenubar } from '@/components/EditorMenubar';

export type AppView = 'main' | 'flows' | 'systemFlow' | 'dataObjects';

type Props = {
  status: string;
  onClearDatabase: () => void;
  onOpenImportMarkdown: () => void;
  onExportKgVectors?: () => void;
  onExportBundleZip?: () => void;
  activeFileName?: string;
  onlineCount?: number;
};

export function AppHeader({ status, onClearDatabase, onOpenImportMarkdown, onExportKgVectors, onExportBundleZip, activeFileName, onlineCount }: Props) {
  return (
    <EditorMenubar
      status={status}
      onlineCount={onlineCount}
      activeFileName={activeFileName}
      fileMenuItems={[
        { id: 'import-md', label: 'Import MD', icon: <Download size={14} />, onClick: onOpenImportMarkdown },
        ...(onExportBundleZip ? [{ id: 'export-bundle', label: 'Export bundle (.zip)', icon: <Package size={14} />, onClick: onExportBundleZip }] : []),
        ...(onExportKgVectors ? [{ id: 'export-kg', label: 'Export semantic KG + vectors', icon: <Share2 size={14} />, onClick: onExportKgVectors }] : []),
        { id: 'clear-db', label: 'Clear DB', icon: <Trash2 size={14} />, onClick: onClearDatabase },
      ]}
    />
  );
}

