'use client';

import { useRouter } from 'next/navigation';
import type { GlobalTemplatePublisher } from '@/components/templates/useGlobalTemplatePublisher';

export function TemplateGlobalPublishControls(props: {
  publisher: GlobalTemplatePublisher;
  hasHeader: boolean;
  publishName: string;
  publishContent: string;
}) {
  const router = useRouter();
  const { publisher, hasHeader, publishName, publishContent } = props;

  const showSignIn = publisher.needsSignIn;
  const showPublish = publisher.canPublish;

  return (
    <div className="flex items-center gap-2">
      {showSignIn ? (
        <button
          type="button"
          className="mac-btn h-8"
          title="Sign in with Supabase auth to publish global templates."
          onClick={() => {
            const next = typeof window !== 'undefined' ? `${window.location.pathname}${window.location.search || ''}` : '/workspace';
            router.push(`/login?next=${encodeURIComponent(next)}`);
          }}
        >
          Sign in to publish
        </button>
      ) : null}

      {showPublish ? (
        <button
          type="button"
          className="mac-btn h-8"
          disabled={!publisher.canPublish || publisher.publishing}
          title={
            !hasHeader
              ? 'Add a valid `nexus-template` header to publish.'
              : publisher.publishing
                  ? 'Publishing…'
                  : 'Publish this template snapshot to Global.'
          }
          onClick={async () => {
            publisher.clearMessages();
            await publisher.publish({ name: publishName, content: publishContent });
          }}
        >
          Publish to global
        </button>
      ) : null}

      {publisher.ok ? <div className="mac-window mac-shadow-hard px-2 py-1 text-[11px] text-emerald-800 bg-white">{publisher.ok}</div> : null}
      {publisher.error ? (
        <div className="mac-window mac-shadow-hard px-2 py-1 text-[11px] text-red-800 bg-white max-w-[520px] truncate" title={publisher.error}>
          {publisher.error}
        </div>
      ) : null}
    </div>
  );
}

