import * as Y from 'yjs';

export type CommentReply = {
  id: string;
  body: string;
  createdAt: number;
};

export type CommentAnchor =
  | {
      kind: 'visionPoint';
      /** tldraw page id */
      pageId: string;
      /** tldraw page coordinates */
      x: number;
      y: number;
    };

export type CommentThread = {
  id: string;
  targetLabel?: string;
  body: string;
  createdAt: number;
  replies: CommentReply[];
  resolved?: boolean;
};

type CommentsDocShape = {
  version: 1;
  // targetKey -> thread (we intentionally keep it “one thread per target”, Figma-style)
  threads: Record<string, CommentThread | undefined>;
  /** Optional anchor metadata for canvas-style comment targets (e.g. Vision click-anywhere pins). */
  anchors?: Record<string, CommentAnchor | undefined>;
};

const MAP_NAME = 'node-comments-v1';
const ROOT_KEY = 'data';

function nowId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function defaultShape(): CommentsDocShape {
  return { version: 1, threads: {}, anchors: {} };
}

function readShape(doc: Y.Doc): CommentsDocShape {
  const m = doc.getMap(MAP_NAME);
  const raw = m.get(ROOT_KEY);
  if (!raw || typeof raw !== 'object') return defaultShape();
  const rec = raw as Record<string, unknown>;
  const version = rec.version === 1 ? 1 : 1;
  const threadsRaw = rec.threads && typeof rec.threads === 'object' ? (rec.threads as Record<string, unknown>) : {};
  const threads: Record<string, CommentThread | undefined> = {};
  Object.entries(threadsRaw).forEach(([k, v]) => {
    if (!v || typeof v !== 'object') return;
    const t = v as Record<string, unknown>;
    if (typeof t.id !== 'string' || typeof t.body !== 'string' || typeof t.createdAt !== 'number') return;
    const repliesRaw = Array.isArray(t.replies) ? t.replies : [];
    const replies: CommentReply[] = repliesRaw
      .map((r: any) => {
        if (!r || typeof r !== 'object') return null;
        if (typeof r.id !== 'string' || typeof r.body !== 'string' || typeof r.createdAt !== 'number') return null;
        return { id: r.id, body: r.body, createdAt: r.createdAt } satisfies CommentReply;
      })
      .filter(Boolean) as CommentReply[];
    threads[k] = {
      id: t.id,
      ...(typeof t.targetLabel === 'string' ? { targetLabel: t.targetLabel } : {}),
      body: t.body,
      createdAt: t.createdAt,
      replies,
      ...(typeof t.resolved === 'boolean' ? { resolved: t.resolved } : {}),
    } satisfies CommentThread;
  });

  const anchorsRaw = rec.anchors && typeof rec.anchors === 'object' ? (rec.anchors as Record<string, unknown>) : {};
  const anchors: Record<string, CommentAnchor | undefined> = {};
  Object.entries(anchorsRaw).forEach(([k, v]) => {
    if (!v || typeof v !== 'object') return;
    const a = v as Record<string, unknown>;
    const kind = String(a.kind || '');
    if (kind === 'visionPoint') {
      const pageId = typeof a.pageId === 'string' ? a.pageId : '';
      const x = typeof a.x === 'number' ? a.x : NaN;
      const y = typeof a.y === 'number' ? a.y : NaN;
      if (!pageId || !Number.isFinite(x) || !Number.isFinite(y)) return;
      anchors[k] = { kind: 'visionPoint', pageId, x, y };
    }
  });

  return { version, threads, anchors };
}

function writeShape(doc: Y.Doc, shape: CommentsDocShape): void {
  const m = doc.getMap(MAP_NAME);
  doc.transact(() => {
    m.set(ROOT_KEY, shape);
  });
}

export function buildNexusNodeCommentTargetKey(runningNumber: number): string {
  return `n:${runningNumber}`;
}

export function buildDataObjectCommentTargetKey(dataObjectId: string): string {
  return `do:${dataObjectId}`;
}

export function buildSystemFlowBoxCommentTargetKey(sfid: string, boxKey: string): string {
  // sfid and boxKey are stable ids persisted in systemflow-* blocks
  return `sf:${sfid}:box:${boxKey}`;
}

export function buildVisionPointCommentTargetKey(id: string): string {
  return `vision:p:${id}`;
}

export function isVisionPointCommentTargetKey(targetKey: string): boolean {
  return typeof targetKey === 'string' && targetKey.startsWith('vision:p:');
}

export function getThread(doc: Y.Doc, targetKey: string): CommentThread | null {
  const shape = readShape(doc);
  return shape.threads[targetKey] || null;
}

export function getAllThreads(doc: Y.Doc): Record<string, CommentThread> {
  const shape = readShape(doc);
  const out: Record<string, CommentThread> = {};
  Object.entries(shape.threads).forEach(([k, t]) => {
    if (t) out[k] = t;
  });
  return out;
}

export function getAnchor(doc: Y.Doc, targetKey: string): CommentAnchor | null {
  const shape = readShape(doc);
  return shape.anchors?.[targetKey] || null;
}

export function getAllAnchors(doc: Y.Doc): Record<string, CommentAnchor> {
  const shape = readShape(doc);
  const out: Record<string, CommentAnchor> = {};
  Object.entries(shape.anchors || {}).forEach(([k, a]) => {
    if (a) out[k] = a;
  });
  return out;
}

export function upsertAnchor(doc: Y.Doc, targetKey: string, anchor: CommentAnchor): void {
  const shape = readShape(doc);
  const anchors = shape.anchors || {};
  anchors[targetKey] = anchor;
  shape.anchors = anchors;
  writeShape(doc, shape);
}

export function deleteAnchor(doc: Y.Doc, targetKey: string): void {
  const shape = readShape(doc);
  if (!shape.anchors || !shape.anchors[targetKey]) return;
  delete shape.anchors[targetKey];
  writeShape(doc, shape);
}

export function upsertThread(doc: Y.Doc, targetKey: string, body: string): CommentThread {
  const shape = readShape(doc);
  const nextBody = body.trim();
  const existing = shape.threads[targetKey];
  const thread: CommentThread = existing
    ? { ...existing, body: nextBody }
    : { id: nowId('thread'), body: nextBody, createdAt: Date.now(), replies: [] };
  shape.threads[targetKey] = thread;
  writeShape(doc, shape);
  return thread;
}

export function upsertThreadWithLabel(
  doc: Y.Doc,
  opts: { targetKey: string; body: string; targetLabel?: string },
): CommentThread {
  const { targetKey, body, targetLabel } = opts;
  const shape = readShape(doc);
  const nextBody = body.trim();
  const existing = shape.threads[targetKey];
  const thread: CommentThread = existing
    ? {
        ...existing,
        body: nextBody,
        ...(typeof targetLabel === 'string' && targetLabel.trim()
          ? { targetLabel: targetLabel.trim() }
          : {}),
      }
    : {
        id: nowId('thread'),
        body: nextBody,
        createdAt: Date.now(),
        replies: [],
        ...(typeof targetLabel === 'string' && targetLabel.trim() ? { targetLabel: targetLabel.trim() } : {}),
      };
  shape.threads[targetKey] = thread;
  writeShape(doc, shape);
  return thread;
}

export function addReply(doc: Y.Doc, targetKey: string, body: string): CommentReply | null {
  const shape = readShape(doc);
  const thread = shape.threads[targetKey];
  if (!thread) return null;
  const reply: CommentReply = { id: nowId('reply'), body: body.trim(), createdAt: Date.now() };
  thread.replies = [...(thread.replies || []), reply];
  shape.threads[targetKey] = thread;
  writeShape(doc, shape);
  return reply;
}

export function deleteThread(doc: Y.Doc, targetKey: string): void {
  const shape = readShape(doc);
  const hadThread = !!shape.threads[targetKey];
  const hadAnchor = !!shape.anchors?.[targetKey];
  if (!hadThread && !hadAnchor) return;
  delete shape.threads[targetKey];
  if (shape.anchors) delete shape.anchors[targetKey];
  writeShape(doc, shape);
}

export function observeComments(doc: Y.Doc, cb: () => void): () => void {
  const m = doc.getMap(MAP_NAME);
  const handler = () => cb();
  m.observe(handler);
  return () => m.unobserve(handler);
}

