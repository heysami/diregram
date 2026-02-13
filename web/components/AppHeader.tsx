'use client';

import { Download, Database, FlaskConical, Workflow, Network } from 'lucide-react';
import { AuthStatus } from '@/components/AuthStatus';
import { useRouter } from 'next/navigation';

export type AppView = 'main' | 'flows' | 'systemFlow' | 'dataObjects' | 'testing';

type Props = {
  activeView: AppView;
  onChangeView: (v: AppView) => void;
  status: string;
  onClearDatabase: () => void;
  onOpenImportMarkdown: () => void;
  activeFileName?: string;
  onlineCount?: number;
  onGoHome?: () => void;
};

export function AppHeader({ activeView, onChangeView, status, onClearDatabase, onOpenImportMarkdown, activeFileName, onlineCount, onGoHome }: Props) {
  const router = useRouter();

  return (
    <header className="mac-menubar px-4 flex items-center justify-between shrink-0 z-10 relative">
      <div className="flex items-center gap-4">
        <button type="button" onClick={() => router.push('/')} className="text-left">
          <h1 className="text-[13px] font-bold tracking-tight">
            <span aria-hidden className="mr-1 select-none"></span>
            Diregram <span className="text-[11px] font-normal opacity-70">Editor</span>
          </h1>
        </button>
        {onGoHome ? (
          <button type="button" onClick={onGoHome} className="mac-btn" title="Go to workspace">
            Home
          </button>
        ) : null}
        {activeFileName ? <div className="text-[12px] font-semibold opacity-80 truncate max-w-[320px]">{activeFileName}</div> : null}

        <div className="mac-segmented">
          <button
            type="button"
            onClick={() => onChangeView('main')}
            className={`mac-seg-btn ${activeView === 'main' ? 'is-active' : ''}`}
            title="Main canvas"
          >
            Canvas
          </button>
          <button
            type="button"
            onClick={() => onChangeView('flows')}
            className={`mac-seg-btn flex items-center gap-1.5 ${activeView === 'flows' ? 'is-active' : ''}`}
            title="Flows (F)"
          >
            <Workflow size={14} />
            Flow
          </button>
          <button
            type="button"
            onClick={() => onChangeView('systemFlow')}
            className={`mac-seg-btn flex items-center gap-1.5 ${activeView === 'systemFlow' ? 'is-active' : ''}`}
            title="System Flow (S)"
          >
            <Network size={14} />
            System Flow
          </button>
          <button
            type="button"
            onClick={() => onChangeView('dataObjects')}
            className={`mac-seg-btn flex items-center gap-1.5 ${activeView === 'dataObjects' ? 'is-active' : ''}`}
            title="Data Objects (D)"
          >
            <Database size={14} />
            Data Objects
          </button>
          <button
            type="button"
            onClick={() => onChangeView('testing')}
            className={`mac-seg-btn flex items-center gap-1.5 ${activeView === 'testing' ? 'is-active' : ''}`}
            title="Testing (T)"
          >
            <FlaskConical size={14} />
            Testing
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 text-[12px]">
        <AuthStatus />
        {typeof onlineCount === 'number' ? (
          <div className="text-[11px] mac-double-outline px-2 py-1">
            Online: <span className="font-semibold">{onlineCount}</span>
          </div>
        ) : null}
        <button
          onClick={onOpenImportMarkdown}
          className="mac-btn mac-btn--primary flex items-center gap-1.5"
          title="Import markdown (replaces the map)"
        >
          <Download size={14} />
          Import MD
        </button>
        <button
          onClick={onClearDatabase}
          className="mac-btn mac-btn--danger"
          title="Clear all nodes (emergency)"
        >
          Clear DB
        </button>
        <span
          className="inline-block w-2.5 h-2.5 border border-black"
          style={{ background: status === 'connected' ? '#000' : '#fff' }}
          aria-label={status}
          title={status}
        />
        <span className="opacity-80">{status}</span>
      </div>
    </header>
  );
}

