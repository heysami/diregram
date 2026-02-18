'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isUuid } from '@/lib/is-uuid';
import { publishGlobalTemplateSnapshot } from '@/lib/global-templates';
import { loadLastGlobalPublishRecord, saveLastGlobalPublishRecord, type LastGlobalPublishRecord } from '@/lib/template-global-publish-record';

export type GlobalTemplatePublisher = {
  canAttempt: boolean;
  needsSignIn: boolean;
  canPublish: boolean;
  publishing: boolean;
  ok: string | null;
  error: string | null;
  lastPublish: LastGlobalPublishRecord | null;
  publish: (res: { name: string; content: string }) => Promise<string>;
  clearMessages: () => void;
};

export function useGlobalTemplatePublisher(opts: {
  configured: boolean;
  ready: boolean;
  supabase: SupabaseClient | null;
  sessionUserId: string | null | undefined;
  activeFileId: string | null | undefined;
  hasHeader: boolean;
}) {
  const { configured, ready, supabase, sessionUserId, activeFileId, hasHeader } = opts;

  const [publishing, setPublishing] = useState(false);
  const [ok, setOk] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastPublish, setLastPublish] = useState<LastGlobalPublishRecord | null>(null);

  useEffect(() => {
    setLastPublish(loadLastGlobalPublishRecord(activeFileId));
  }, [activeFileId]);

  const canAttempt = useMemo(() => configured && ready && !!supabase, [configured, ready, supabase]);
  const hasSupabaseAuth = useMemo(() => isUuid(sessionUserId), [sessionUserId]);
  const needsSignIn = useMemo(() => canAttempt && !hasSupabaseAuth, [canAttempt, hasSupabaseAuth]);
  const canPublish = useMemo(() => canAttempt && hasSupabaseAuth && hasHeader, [canAttempt, hasHeader, hasSupabaseAuth]);

  const publish = useCallback(
    async (res: { name: string; content: string }) => {
      if (!ready) throw new Error('Not ready.');
      if (!supabase) throw new Error('No Supabase client.');
      if (!hasHeader) throw new Error('Missing template header.');
      const ownerId = typeof sessionUserId === 'string' ? sessionUserId : '';
      if (!isUuid(ownerId)) throw new Error('Sign in required.');

      setError(null);
      setOk(null);
      setPublishing(true);
      try {
        const publishedId = await publishGlobalTemplateSnapshot(supabase, {
          name: res.name,
          content: res.content,
          ownerId,
        });
        const rec: LastGlobalPublishRecord = { id: String(publishedId || ''), name: res.name, atIso: new Date().toISOString() };
        saveLastGlobalPublishRecord(activeFileId, rec);
        setLastPublish(rec);
        setOk('Published to Global templates.');
        return publishedId;
      } catch (e) {
        const asAny = e as any;
        const msg =
          typeof asAny?.message === 'string' && asAny.message.trim()
            ? String(asAny.message)
            : typeof asAny?.error?.message === 'string' && asAny.error.message.trim()
              ? String(asAny.error.message)
              : 'Failed to publish globally.';
        setError(msg);
        throw e;
      } finally {
        setPublishing(false);
      }
    },
    [activeFileId, hasHeader, ready, sessionUserId, supabase],
  );

  const out: GlobalTemplatePublisher = {
    canAttempt,
    needsSignIn,
    canPublish,
    publishing,
    ok,
    error,
    lastPublish,
    publish,
    clearMessages() {
      setOk(null);
      setError(null);
    },
  };

  return out;
}

