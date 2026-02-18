'use client';

import { TemplateRenderedPreview } from '@/components/templates/TemplateRenderedPreview';
import type { NexusTemplateHeader } from '@/lib/nexus-template';
import { useInViewOnce } from '@/components/global-templates/useInViewOnce';

export function LazyTemplateThumbnail(props: { header: NexusTemplateHeader | null; rendered: string; heightPx: number; label: string }) {
  const { header, rendered, heightPx, label } = props;
  const { ref, inView } = useInViewOnce<HTMLDivElement>({ rootMargin: '260px' });
  return (
    <div ref={ref} className="pointer-events-none overflow-hidden rounded-lg" style={{ height: heightPx }}>
      {inView ? (
        <TemplateRenderedPreview header={header} rendered={rendered} heightPx={heightPx} />
      ) : (
        <div className="h-full w-full rounded-lg border border-slate-200 bg-white flex items-center justify-center text-[11px] opacity-70">
          {label}
        </div>
      )}
    </div>
  );
}

