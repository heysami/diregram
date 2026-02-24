'use client';

import { useRouter } from 'next/navigation';
import { AuthStatus } from '@/components/AuthStatus';
import { DiregramMark } from '@/components/DiregramMark';

export function GlobalTemplatesTopNav(props: { titleSuffix: string; backToGlobalList?: boolean }) {
  const router = useRouter();
  const { titleSuffix, backToGlobalList } = props;

  return (
    <header className="mac-menubar px-4 flex items-center justify-between shrink-0 z-10 sticky top-0">
      <div className="flex items-center gap-4 min-w-0">
        <button type="button" onClick={() => router.push('/')} className="text-left" title="Home">
          <h1 className="text-[13px] font-bold tracking-tight">
            <span aria-hidden className="mr-1 select-none inline-flex items-center align-middle">
              <DiregramMark size={14} />
            </span>
            Diregram <span className="text-[11px] font-normal opacity-70">{titleSuffix}</span>
          </h1>
        </button>
        {backToGlobalList ? (
          <button type="button" className="mac-btn mac-btn--lg" onClick={() => router.push('/templates/global')}>
            Global templates
          </button>
        ) : (
          <button type="button" className="mac-btn mac-btn--lg" onClick={() => router.push('/workspace')}>
            Workspace
          </button>
        )}
      </div>
      <div className="flex items-center gap-3">
        <AuthStatus />
      </div>
    </header>
  );
}
