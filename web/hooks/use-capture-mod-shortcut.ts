'use client';

import { useEffect, useRef } from 'react';

export function useCaptureModShortcut(opts: {
  key: string;
  enabled: boolean;
  onTrigger: (e: KeyboardEvent) => void;
}) {
  const { key, enabled, onTrigger } = opts;

  const keyRef = useRef<string>('');
  const onTriggerRef = useRef<(e: KeyboardEvent) => void>(() => {});
  useEffect(() => {
    keyRef.current = String(key || '').toLowerCase();
    onTriggerRef.current = onTrigger;
  }, [key, onTrigger]);

  useEffect(() => {
    if (!enabled) return;
    const onKeyDownCapture = (e: KeyboardEvent) => {
      const k = String(e.key || '').toLowerCase();
      const mod = !!(e.metaKey || e.ctrlKey);
      if (!(mod && k === keyRef.current)) return;
      onTriggerRef.current(e);
    };
    window.addEventListener('keydown', onKeyDownCapture, { capture: true });
    return () => window.removeEventListener('keydown', onKeyDownCapture, { capture: true } as any);
  }, [enabled]);
}

