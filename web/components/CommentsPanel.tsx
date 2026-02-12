'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import * as Y from 'yjs';
import { Trash2, X } from 'lucide-react';
import { addReply, deleteThread, getAllThreads, getThread, observeComments, upsertThreadWithLabel, type CommentThread } from '@/lib/node-comments';

type Props = {
  doc: Y.Doc;
  selectedTargetKey: string | null;
  selectedTargetLabel?: string;
  onClose: () => void;
  scrollToThreadId?: string | null;
};

export function CommentsPanel({ doc, selectedTargetKey, selectedTargetLabel, onClose, scrollToThreadId }: Props) {
  const [tick, setTick] = useState(0);
  const [draft, setDraft] = useState('');
  const [replyDraftByThreadId, setReplyDraftByThreadId] = useState<Record<string, string>>({});
  const [activeTargetKey, setActiveTargetKey] = useState<string | null>(selectedTargetKey);

  const threadRef = useRef<HTMLDivElement>(null);
  const listItemRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  useEffect(() => {
    return observeComments(doc, () => setTick((t) => t + 1));
  }, [doc]);

  useEffect(() => {
    if (selectedTargetKey) setActiveTargetKey(selectedTargetKey);
  }, [selectedTargetKey]);

  const allThreads = useMemo(() => getAllThreads(doc), [doc, tick]);
  const threadsList = useMemo(() => {
    const list = Object.entries(allThreads)
      .map(([k, t]) => ({ targetKey: k, thread: t }))
      .sort((a, b) => b.thread.createdAt - a.thread.createdAt);
    return list;
  }, [allThreads]);

  const thread: CommentThread | null = useMemo(
    () => (activeTargetKey ? getThread(doc, activeTargetKey) : null),
    [doc, activeTargetKey, tick],
  );

  const activeLabel = useMemo(() => {
    if (activeTargetKey) {
      const t = allThreads[activeTargetKey];
      if (t?.targetLabel?.trim()) return t.targetLabel;
      return activeTargetKey;
    }
    return selectedTargetLabel || selectedTargetKey || null;
  }, [activeTargetKey, allThreads, selectedTargetKey, selectedTargetLabel]);

  useEffect(() => {
    if (!scrollToThreadId) return;
    if (!thread) return;
    if (thread.id !== scrollToThreadId) return;
    // Simple: one thread per target; scroll to the top.
    threadRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [scrollToThreadId, thread]);

  useEffect(() => {
    if (!scrollToThreadId) return;
    // Scroll the list item into view too (works even if thread is not currently active)
    const found = threadsList.find((x) => x.thread.id === scrollToThreadId);
    if (!found) return;
    const el = listItemRefs.current.get(found.targetKey);
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [scrollToThreadId, threadsList]);

  const upsert = () => {
    const body = draft.trim();
    if (!body) return;
    if (!activeTargetKey) return;
    const t = upsertThreadWithLabel(doc, {
      targetKey: activeTargetKey,
      body,
      targetLabel:
        activeTargetKey === selectedTargetKey
          ? selectedTargetLabel
          : allThreads[activeTargetKey]?.targetLabel,
    });
    setDraft('');
    // Ensure reply drafts map key exists
    setReplyDraftByThreadId((p) => ({ ...p, [t.id]: p[t.id] ?? '' }));
  };

  const onReply = (t: CommentThread) => {
    const body = (replyDraftByThreadId[t.id] || '').trim();
    if (!body) return;
    if (!activeTargetKey) return;
    addReply(doc, activeTargetKey, body);
    setReplyDraftByThreadId((p) => ({ ...p, [t.id]: '' }));
  };

  return (
    <div className="w-[380px] h-full flex flex-col relative z-50 pointer-events-auto mac-window">
      <div className="mac-titlebar">
        <div className="mac-title">Comments</div>
        <div className="absolute right-1 top-1/2 -translate-y-1/2">
          <button
            type="button"
            onClick={onClose}
            className="mac-btn"
            title="Close"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      <div className="px-4 py-3 border-b bg-slate-50">
        <div className="text-[11px] text-slate-600 truncate" title={activeLabel || 'None'}>
          <span className="font-semibold text-slate-700">Selected:</span>{' '}
          {activeLabel || 'None (click a node/object)'}
        </div>
        <div className="mt-2 text-[11px] text-slate-500">
          All comments for this map. One thread per node/object (Figma-style). Replies stay under the original comment.
        </div>

        {activeTargetKey && !thread ? (
          <div className="mt-2 flex gap-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={3}
              className="flex-1 rounded-md border border-slate-200 px-2 py-1 text-[12px] focus:outline-none focus:ring-2 focus:ring-blue-200"
              placeholder="Write a comment…"
            />
            <button
              type="button"
              onClick={upsert}
              className="h-8 px-3 rounded-md bg-blue-600 text-white text-[12px] font-semibold hover:bg-blue-700"
            >
              Add
            </button>
          </div>
        ) : null}
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-3">
        <div className="space-y-2">
          <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">All threads</div>
          {threadsList.length ? (
            <div className="space-y-1">
              {threadsList.map(({ targetKey, thread }) => {
                const isActive = targetKey === activeTargetKey;
                const label = thread.targetLabel || targetKey;
                const preview = thread.body.length > 70 ? thread.body.slice(0, 70) + '…' : thread.body;
                return (
                  <button
                    key={thread.id}
                    ref={(el) => {
                      if (el) listItemRefs.current.set(targetKey, el);
                      else listItemRefs.current.delete(targetKey);
                    }}
                    type="button"
                    onClick={() => setActiveTargetKey(targetKey)}
                    className={`w-full text-left rounded-md border px-2 py-2 ${
                      isActive ? 'border-blue-200 bg-blue-50' : 'border-slate-200 hover:bg-slate-50'
                    }`}
                    title={label}
                  >
                    <div className="text-[11px] font-semibold text-slate-800 truncate">{label}</div>
                    <div className="text-[11px] text-slate-600 truncate">{preview}</div>
                    <div className="mt-1 text-[10px] text-slate-400">
                      {new Date(thread.createdAt).toLocaleString()} · {1 + (thread.replies?.length || 0)} messages
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="text-[12px] text-slate-500">No comments yet.</div>
          )}
        </div>

        {thread ? (
          <div ref={threadRef} className="rounded-lg border border-slate-200 shadow-sm bg-white">
            <div className="p-3 border-b border-slate-100">
              <div className="flex items-start justify-between gap-2">
                <div className="text-[12px] text-slate-900 whitespace-pre-wrap">{thread.body}</div>
                <button
                  type="button"
                  onClick={() => {
                    if (!activeTargetKey) return;
                    deleteThread(doc, activeTargetKey);
                    setActiveTargetKey(null);
                  }}
                  className="p-1 rounded hover:bg-red-50 text-slate-500 hover:text-red-700"
                  title="Delete comment"
                >
                  <Trash2 size={14} />
                </button>
              </div>
              <div className="mt-2 text-[10px] text-slate-400">{new Date(thread.createdAt).toLocaleString()}</div>
            </div>

            <div className="p-3 space-y-2">
              {thread.replies?.length ? (
                <div className="space-y-2">
                  {thread.replies.map((r) => (
                    <div key={r.id} className="rounded-md bg-slate-50 border border-slate-100 px-2 py-2">
                      <div className="text-[12px] text-slate-800 whitespace-pre-wrap">{r.body}</div>
                      <div className="mt-1 text-[10px] text-slate-400">{new Date(r.createdAt).toLocaleString()}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-[11px] text-slate-500">No replies yet.</div>
              )}

              <div className="pt-2 border-t border-slate-100 flex gap-2">
                <input
                  value={replyDraftByThreadId[thread.id] || ''}
                  onChange={(e) => setReplyDraftByThreadId((p) => ({ ...p, [thread.id]: e.target.value }))}
                  className="flex-1 rounded-md border border-slate-200 px-2 py-1 text-[12px] focus:outline-none focus:ring-2 focus:ring-blue-200"
                  placeholder="Reply…"
                />
                <button
                  type="button"
                  onClick={() => onReply(thread)}
                  className="h-8 px-3 rounded-md bg-slate-900 text-white text-[12px] font-semibold hover:bg-slate-800"
                >
                  Reply
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-[12px] text-slate-500">
            {activeTargetKey ? 'No comment yet for this target.' : 'Select a thread or click a node/object to start.'}
          </div>
        )}
      </div>
    </div>
  );
}

