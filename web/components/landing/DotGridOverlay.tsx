'use client';

import { useEffect, useRef } from 'react';

export function DotGridOverlay({ className = '' }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const draw = () => {
      const width = canvas.width;
      const height = canvas.height;
      const step = 40;
      const mark = 6;

      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = '#1a1a1a';

      const rows = Math.ceil(height / step);
      const cols = Math.ceil(width / step);

      for (let y = 0; y < rows; y += 1) {
        for (let x = 0; x < cols; x += 1) {
          const left = x * step;
          const top = y * step;
          ctx.globalAlpha = 0.15;
          ctx.fillRect(left - mark / 2, top, mark, 1);
          ctx.fillRect(left, top - mark / 2, 1, mark);
        }
      }
    };

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      canvas.width = parent.clientWidth;
      canvas.height = parent.clientHeight;
      draw();
    };

    window.addEventListener('resize', resize);
    resize();

    return () => {
      window.removeEventListener('resize', resize);
    };
  }, []);

  return <canvas ref={ref} className={`absolute inset-0 pointer-events-none z-0 mix-blend-multiply ${className}`} />;
}
