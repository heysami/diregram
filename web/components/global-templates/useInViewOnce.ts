'use client';

import { useEffect, useRef, useState } from 'react';

export function useInViewOnce<T extends HTMLElement>(opts?: { rootMargin?: string }) {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }
    const obs = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        if (entry.isIntersecting) setInView(true);
      },
      { root: null, rootMargin: opts?.rootMargin ?? '240px' },
    );
    obs.observe(el);
    return () => {
      try {
        obs.disconnect();
      } catch {
        // ignore
      }
    };
  }, [opts?.rootMargin]);

  return { ref, inView };
}

