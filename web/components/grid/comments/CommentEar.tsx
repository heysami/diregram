'use client';

export function CommentEar({
  size = 10,
  color = '#0f172a',
  title = 'Has comments',
}: {
  size?: number;
  color?: string;
  title?: string;
}) {
  const s = Math.max(6, Math.round(size));
  return (
    <div
      className="absolute top-0 right-0 pointer-events-none"
      style={{
        width: 0,
        height: 0,
        borderTop: `${s}px solid ${color}`,
        borderLeft: `${s}px solid transparent`,
      }}
      title={title}
    />
  );
}

