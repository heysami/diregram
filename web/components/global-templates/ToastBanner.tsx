'use client';

export function ToastBanner(props: { toast: string | null }) {
  const { toast } = props;
  if (!toast) return null;
  return (
    <div className="fixed left-1/2 top-[54px] z-50 -translate-x-1/2 mac-double-outline bg-white px-3 py-1 text-xs">
      {toast}
    </div>
  );
}

