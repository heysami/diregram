'use client';

import { useEffect } from 'react';

/**
 * Temporarily overrides the root `<html data-theme="...">` attribute.
 *
 * In this repo, Mac3 styling is gated by `html[data-theme="mac3"] ...`,
 * so switching the theme disables the app chrome/patterns for isolated editors.
 */
export function useHtmlThemeOverride(nextTheme: string | null) {
  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (!nextTheme) return;

    const el = document.documentElement;
    const prev = el.getAttribute('data-theme');
    el.setAttribute('data-theme', nextTheme);

    return () => {
      if (prev) el.setAttribute('data-theme', prev);
      else el.removeAttribute('data-theme');
    };
  }, [nextTheme]);
}

