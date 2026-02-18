'use client';

import type { LastGlobalPublishRecord } from '@/lib/template-global-publish-record';

export function TemplateGlobalPublishPanel(props: { lastPublish: LastGlobalPublishRecord | null }) {
  const { lastPublish } = props;
  return (
    <div className="rounded border border-slate-200 bg-white p-3 space-y-1">
      <div className="text-xs font-semibold">Global publish</div>
      {lastPublish ? (
        <div className="text-[11px] opacity-80 space-y-1">
          <div>
            last: <span className="font-mono">{lastPublish.name || 'Template'}</span>
          </div>
          <div>
            at:{' '}
            <span className="font-mono">
              {(() => {
                try {
                  return new Date(lastPublish.atIso).toLocaleString();
                } catch {
                  return lastPublish.atIso;
                }
              })()}
            </span>
          </div>
        </div>
      ) : (
        <div className="text-xs opacity-70">Not published yet (from this file).</div>
      )}
    </div>
  );
}

