'use client';

import type { ReactNode } from 'react';

export function TldrawOverlayPanel({
  className = '',
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`nx-tldraw-floating overflow-visible pointer-events-auto ${className}`}>
      <div className="nx-tldraw-floating__body space-y-4">{children}</div>
    </div>
  );
}

