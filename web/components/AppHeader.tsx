'use client';

import { Download, Trash2 } from 'lucide-react';
import { EditorMenubar } from '@/components/EditorMenubar';

export type AppView = 'main' | 'flows' | 'systemFlow' | 'dataObjects' | 'testing';

type Props = {
  status: string;
  onClearDatabase: () => void;
  onOpenImportMarkdown: () => void;
  activeFileName?: string;
  onlineCount?: number;
};

export function AppHeader({ status, onClearDatabase, onOpenImportMarkdown, activeFileName, onlineCount }: Props) {
  return (
    <EditorMenubar
      status={status}
      onlineCount={onlineCount}
      activeFileName={activeFileName}
      fileMenuItems={[
        { id: 'import-md', label: 'Import MD', icon: <Download size={14} />, onClick: onOpenImportMarkdown },
        { id: 'clear-db', label: 'Clear DB', icon: <Trash2 size={14} />, onClick: onClearDatabase },
      ]}
    />
  );
}

