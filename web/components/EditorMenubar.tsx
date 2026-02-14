'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown } from 'lucide-react';
import { AuthStatus } from '@/components/AuthStatus';
import { DiregramMark } from '@/components/DiregramMark';

export type MenubarItem = {
  id: string;
  label: string;
  icon?: ReactNode;
  onClick: () => void;
};

export function EditorMenubar({
  status,
  onlineCount,
  activeFileName,
  onWorkspace,
  fileMenuItems = [],
  rightContent = null,
  showAuthStatus = true,
}: {
  status: string;
  onlineCount?: number;
  activeFileName?: string;
  onWorkspace?: () => void;
  fileMenuItems?: MenubarItem[];
  rightContent?: ReactNode;
  showAuthStatus?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const el = menuRef.current;
      if (!el) return;
      if (e.target instanceof Node && el.contains(e.target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  const goWorkspace = () => {
    if (onWorkspace) onWorkspace();
    else router.push('/workspace');
  };

  return (
    <header className="mac-menubar px-4 flex items-center justify-between shrink-0 z-[100] relative">
      <div className="flex items-center gap-4 min-w-0">
        <button type="button" onClick={goWorkspace} className="text-left" title="Workspace">
          <h1 className="text-[13px] font-bold tracking-tight">
            <span aria-hidden className="mr-1 select-none inline-flex items-center align-middle">
              <DiregramMark size={14} />
            </span>
            Diregram <span className="text-[11px] font-normal opacity-70">Editor</span>
          </h1>
        </button>

        {fileMenuItems.length ? (
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              className="mac-btn flex items-center gap-1.5"
              onClick={() => setOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={open}
            >
              File <ChevronDown size={14} />
            </button>
            {open ? (
              <div
                role="menu"
                className="absolute left-0 top-[calc(100%+6px)] z-50 mac-window mac-double-outline overflow-hidden min-w-[220px]"
              >
                {fileMenuItems.map((it) => (
                  <button
                    key={it.id}
                    role="menuitem"
                    type="button"
                    className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 flex items-center gap-2"
                    onClick={() => {
                      setOpen(false);
                      it.onClick();
                    }}
                  >
                    {it.icon}
                    {it.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {activeFileName ? (
          <div className="text-[12px] font-semibold opacity-80 truncate max-w-[320px]" title={activeFileName}>
            {activeFileName}
          </div>
        ) : null}
      </div>

      <div className="flex items-center gap-2 text-[12px]">
        {rightContent}
        {showAuthStatus ? <AuthStatus onlineCount={onlineCount} status={status} /> : null}
      </div>
    </header>
  );
}

