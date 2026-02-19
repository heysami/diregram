import type { SupabaseClient } from '@supabase/supabase-js';
import * as Y from 'yjs';
import { ensureLocalFileStore } from '@/lib/local-file-store';
import { loadFileSnapshot } from '@/lib/local-doc-snapshots';
import { parseNexusMarkdown } from '@/lib/nexus-parser';
import { extractExpandedIdsFromMarkdown } from '@/lib/expanded-state-storage';
import { loadVisionDoc } from '@/lib/visionjson';
import { readTemplateHeader } from '@/lib/nexus-template';
import { loadTestDoc } from '@/lib/testjson';
import { extractRunningNumbersFromMarkdown } from '@/lib/node-running-numbers';
import { loadTagStore } from '@/lib/tag-store';
import { loadDataObjects } from '@/lib/data-object-storage';
import { loadSystemFlowStateFromMarkdown } from '@/lib/system-flow-storage';
import { loadDataObjectAttributes } from '@/lib/data-object-attributes';
import { loadExpandedGridNodesFromDoc } from '@/lib/expanded-grid-storage';
import { loadFlowNodeData } from '@/lib/flow-node-storage';

export type KgEntityRecord = {
  type: 'entity';
  id: string;
  entityType: string;
  [k: string]: unknown;
};

export type KgEdgeRecord = {
  type: 'edge';
  id: string;
  edgeType: string;
  src: string;
  dst: string;
  [k: string]: unknown;
};

export type EmbeddingChunkRecord = {
  type: 'chunk';
  id: string;
  fileId: string;
  fileKind: string;
  text: string;
  anchor?: string;
  [k: string]: unknown;
};

function nowIso() {
  return new Date().toISOString();
}

function downloadTextFile(filename: string, content: string, mime: string) {
  const safe = filename.replace(/[^\w.\-()+ ]/g, '_').trim() || 'download.txt';
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = safe;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function slugifyHeading(text: string): string {
  return (
    String(text || '')
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'section'
  );
}

type ProjectFileRow = { id: string; name: string; kind: string; folderId: string | null; content: string };

async function listProjectFolderIdsSupabase(supabase: SupabaseClient, folderId: string): Promise<string[]> {
  // Include root project folder + all descendants.
  const seen = new Set<string>();
  let frontier: string[] = [folderId];
  while (frontier.length) {
    const batch = frontier.slice(0, 200);
    frontier = frontier.slice(200);
    batch.forEach((id) => seen.add(id));
    const { data, error } = await supabase.from('folders').select('id,parent_id').in('parent_id', batch);
    if (error) throw error;
    const childIds = (data || [])
      .map((r: any) => String(r?.id || ''))
      .filter(Boolean)
      .filter((id) => !seen.has(id));
    frontier.push(...childIds);
  }
  return Array.from(seen.values());
}

async function listProjectFilesSupabase(supabase: SupabaseClient, folderIds: string[]): Promise<ProjectFileRow[]> {
  const { data, error } = await supabase.from('files').select('id,name,kind,folder_id,content').in('folder_id', folderIds);
  if (error) throw error;
  return (data || [])
    .map((r: any) => ({
      id: String(r?.id || ''),
      name: String(r?.name || 'Untitled'),
      kind: String(r?.kind || 'diagram'),
      folderId: (r?.folder_id ? String(r.folder_id) : null) as string | null,
      content: String(r?.content || ''),
    }))
    .filter((r) => !!r.id);
}

function listProjectFolderIdsLocal(projectFolderId: string): string[] {
  const store = ensureLocalFileStore();
  const seen = new Set<string>();
  const queue: string[] = [projectFolderId];
  while (queue.length) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const childIds = store.folders.filter((f) => f.parentId === id).map((f) => f.id);
    childIds.forEach((cid) => {
      if (!seen.has(cid)) queue.push(cid);
    });
  }
  return Array.from(seen.values());
}

function listProjectFilesLocal(folderIds: string[]): ProjectFileRow[] {
  const store = ensureLocalFileStore();
  return (store.files || [])
    .filter((f) => f.folderId && folderIds.includes(f.folderId))
    .map((f) => ({
      id: String(f.id),
      name: String(f.name || 'Untitled'),
      kind: String(f.kind || 'diagram'),
      folderId: f.folderId,
      content: loadFileSnapshot(f.id) || '',
    }));
}

function fileEntityId(fileId: string) {
  return `file:${fileId}`;
}

function tagEntityId(projectFolderId: string, tagId: string) {
  return `tag:${projectFolderId}:${tagId}`;
}

function tagGroupEntityId(projectFolderId: string, groupId: string) {
  return `tagGroup:${projectFolderId}:${groupId}`;
}

function edgeId(edgeType: string, src: string, dst: string) {
  return `edge:${edgeType}:${src}->${dst}`;
}

function chunkId(fileId: string, anchor: string) {
  return `chunk:${fileId}:${anchor}`;
}

function diagramNodeEntityId(fileId: string, lineIndex: number, expid: number | null) {
  if (typeof expid === 'number' && Number.isFinite(expid)) return `node:${fileId}:expid:${expid}`;
  return `node:${fileId}:line:${lineIndex}`;
}

function noteHeadingEntityId(fileId: string, slug: string, occurrence: number) {
  return `heading:${fileId}:${slug}:${occurrence}`;
}

function visionCardEntityId(fileId: string, cardId: string) {
  return `visioncard:${fileId}:${cardId}`;
}

function templateEntityId(fileId: string) {
  return `template:${fileId}`;
}

function testEntityId(fileId: string) {
  return `test:${fileId}`;
}

function dataObjectEntityId(projectFolderId: string, dataObjectId: string) {
  return `dataObject:${projectFolderId}:${dataObjectId}`;
}

function dataObjectAttrEntityId(projectFolderId: string, dataObjectId: string, attrId: string) {
  return `dataObjectAttr:${projectFolderId}:${dataObjectId}:${attrId}`;
}

function systemFlowEntityId(fileId: string, sfid: string) {
  return `systemflow:${fileId}:${sfid}`;
}

function systemFlowBoxEntityId(fileId: string, sfid: string, boxKey: string) {
  return `systemflowBox:${fileId}:${sfid}:${boxKey}`;
}

function systemFlowLinkEntityId(fileId: string, sfid: string, linkId: string) {
  return `systemflowLink:${fileId}:${sfid}:${linkId}`;
}

function expandedGridNodeEntityId(fileId: string, expid: number, gridNodeKey: string) {
  return `expandedGridNode:${fileId}:${expid}:${gridNodeKey}`;
}

function flowGraphNodeEntityId(fileId: string, runningNumber: number, flowNodeId: string) {
  return `flowGraphNode:${fileId}:${runningNumber}:${flowNodeId}`;
}

function noteEmbedEntityId(fileId: string, embedId: string) {
  return `noteEmbed:${fileId}:${embedId}`;
}

function noteLinkEntityId(fileId: string, linkId: string) {
  return `noteLink:${fileId}:${linkId}`;
}

function visionShapeEntityId(fileId: string, shapeId: string) {
  return `visionShape:${fileId}:${shapeId}`;
}

function exportVisionSemanticKg(opts: {
  file: ProjectFileRow;
  fileEntity: string;
  entities: KgEntityRecord[];
  edges: KgEdgeRecord[];
  chunks: EmbeddingChunkRecord[];
}) {
  const { file: f, fileEntity: fid, entities, edges, chunks } = opts;
  try {
    const v = loadVisionDoc(f.content || '').doc as any;
    const snap = v?.tldraw || null;
    const store = snap?.document?.store;
    if (!store || typeof store !== 'object') return;

    for (const rec of Object.values<any>(store)) {
      if (!rec || rec.typeName !== 'shape') continue;
      const shapeId = String(rec.id || '').trim();
      const shapeType = String(rec.type || '').trim();
      if (!shapeId || !shapeType) continue;

      const sid = visionShapeEntityId(f.id, shapeId);
      entities.push({
        type: 'entity',
        id: sid,
        entityType: 'visionShape',
        fileId: f.id,
        shapeId,
        shapeType,
        x: typeof rec.x === 'number' ? rec.x : undefined,
        y: typeof rec.y === 'number' ? rec.y : undefined,
        opacity: typeof rec.opacity === 'number' ? rec.opacity : undefined,
        parentId: typeof rec.parentId === 'string' ? rec.parentId : undefined,
        index: rec.index,
        // Keep props lightweight but semantic-friendly.
        props: (() => {
          const p = rec.props as any;
          if (!p || typeof p !== 'object') return undefined;
          const out: Record<string, unknown> = {};
          if (typeof p.title === 'string' && p.title.trim()) out.title = String(p.title).trim();
          if (typeof p.text === 'string' && p.text.trim()) out.text = String(p.text).trim();
          if (typeof p.color === 'string' && p.color.trim()) out.color = String(p.color).trim();
          if (typeof p.fill === 'string' && p.fill.trim()) out.fill = String(p.fill).trim();
          if (typeof p.size === 'string' && p.size.trim()) out.size = String(p.size).trim();
          if (p.start && typeof p.start === 'object') out.start = p.start;
          if (p.end && typeof p.end === 'object') out.end = p.end;
          if (typeof p.w === 'number') out.w = p.w;
          if (typeof p.h === 'number') out.h = p.h;
          return Object.keys(out).length ? out : undefined;
        })(),
      });
      edges.push({ type: 'edge', id: edgeId('file_has_vision_shape', fid, sid), edgeType: 'file_has_vision_shape', src: fid, dst: sid });

      // Specialize nxcard as a first-class entity (used by embeds).
      if (shapeType === 'nxcard') {
        const cid = visionCardEntityId(f.id, shapeId);
        const title = typeof rec?.props?.title === 'string' ? String(rec.props.title).trim() : '';
        const hasThumb = !!(rec?.props?.thumb && String(rec.props.thumb).trim());
        entities.push({
          type: 'entity',
          id: cid,
          entityType: 'visionCard',
          fileId: f.id,
          cardId: shapeId,
          title,
          hasThumb,
          shapeEntityId: sid,
        });
        edges.push({ type: 'edge', id: edgeId('file_has_card', fid, cid), edgeType: 'file_has_card', src: fid, dst: cid });
        edges.push({ type: 'edge', id: edgeId('vision_card_is_shape', cid, sid), edgeType: 'vision_card_is_shape', src: cid, dst: sid });
        const text = title ? `Vision card: ${title}` : `Vision card: ${shapeId}`;
        chunks.push({ type: 'chunk', id: chunkId(f.id, `visioncard:${shapeId}`), fileId: f.id, fileKind: f.kind, text, anchor: `visioncard:${shapeId}` });
        continue;
      }

      // Semantic-friendly chunks for common annotation shapes.
      if (shapeType === 'arrow') {
        const p: any = rec.props || {};
        const label = typeof p.text === 'string' ? String(p.text).trim() : '';
        const text = label ? `Vision arrow: ${label}` : `Vision arrow`;
        chunks.push({ type: 'chunk', id: chunkId(f.id, `visionshape:${shapeId}`), fileId: f.id, fileKind: f.kind, text, anchor: `visionshape:${shapeId}` });
        continue;
      }
      if (shapeType === 'text') {
        const p: any = rec.props || {};
        const t = typeof p.text === 'string' ? String(p.text).trim() : '';
        if (t) chunks.push({ type: 'chunk', id: chunkId(f.id, `visionshape:${shapeId}`), fileId: f.id, fileKind: f.kind, text: `Vision text: ${t}`, anchor: `visionshape:${shapeId}` });
        continue;
      }
    }
  } catch {
    // ignore vision parse errors
  }
}

function exportNoteSemanticKg(opts: {
  file: ProjectFileRow;
  fileEntity: string;
  entities: KgEntityRecord[];
  edges: KgEdgeRecord[];
  chunks: EmbeddingChunkRecord[];
}) {
  const { file: f, fileEntity: fid, entities, edges, chunks } = opts;
  const md = String(f.content || '').replace(/\r\n?/g, '\n');
  const lines = md.split('\n');
  const occBySlug = new Map<string, number>();
  const headings: Array<{ lineIndex: number; level: number; text: string; slug: string; occurrence: number }> = [];
  for (let i = 0; i < lines.length; i++) {
    const m = (lines[i] || '').match(/^\s*(#{1,6})\s+(.+?)\s*$/);
    if (!m) continue;
    const level = m[1].length;
    const text = String(m[2] || '').trim();
    const slug = slugifyHeading(text);
    const occ = (occBySlug.get(slug) || 0) + 1;
    occBySlug.set(slug, occ);
    headings.push({ lineIndex: i, level, text, slug, occurrence: occ });
  }

  // Emit heading entities + section chunks (heading + body), so notes carry contextual meaning.
  for (let h = 0; h < headings.length; h++) {
    const cur = headings[h];
    const next = headings[h + 1] || null;
    const start = cur.lineIndex;
    const end = next ? next.lineIndex : lines.length;
    const body = lines.slice(start + 1, end).join('\n').trim();

    const hid = noteHeadingEntityId(f.id, cur.slug, cur.occurrence);
    entities.push({
      type: 'entity',
      id: hid,
      entityType: 'noteHeading',
      fileId: f.id,
      level: cur.level,
      text: cur.text,
      slug: cur.slug,
      occurrence: cur.occurrence,
      lineIndex: cur.lineIndex,
    });
    edges.push({ type: 'edge', id: edgeId('file_has_heading', fid, hid), edgeType: 'file_has_heading', src: fid, dst: hid });

    const sectionText = String([cur.text ? `#`.repeat(cur.level) + ' ' + cur.text : '', body].filter(Boolean).join('\n\n')).trim();
    if (sectionText) {
      chunks.push({
        type: 'chunk',
        id: chunkId(f.id, `heading:${cur.slug}:${cur.occurrence}`),
        fileId: f.id,
        fileKind: f.kind,
        text: sectionText.slice(0, 50_000),
        anchor: `heading:${cur.slug}:${cur.occurrence}`,
      });
    }
  }

  // Export note semantic blocks: nexus-embed and nexus-note-link.
  try {
    let inFence = false;
    let fenceLang = '';
    let fenceStartLineIndex = -1;
    let buf: string[] = [];
    const flush = (startLineIndex: number) => {
      const lang = String(fenceLang || '').trim().toLowerCase();
      const raw = buf.join('\n').trim();
      buf = [];
      fenceLang = '';
      fenceStartLineIndex = -1;
      if (!raw) return;
      const parsed = (() => {
        try {
          return JSON.parse(raw);
        } catch {
          return null;
        }
      })();
      if (!parsed || typeof parsed !== 'object') return;

      if (lang === 'nexus-embed') {
        const spec: any = parsed;
        const embedId = typeof spec?.id === 'string' && spec.id.trim() ? spec.id.trim() : null;
        const kind = typeof spec?.kind === 'string' ? String(spec.kind).trim() : '';
        if (!embedId || !kind) return;
        const eid = noteEmbedEntityId(f.id, embedId);
        entities.push({ type: 'entity', id: eid, entityType: 'noteEmbed', fileId: f.id, embedId, kind, spec });
        edges.push({ type: 'edge', id: edgeId('file_has_note_embed', fid, eid), edgeType: 'file_has_note_embed', src: fid, dst: eid });

        const targetFileId = typeof spec?.fileId === 'string' && spec.fileId.trim() ? String(spec.fileId).trim() : null;
        if (targetFileId)
          edges.push({
            type: 'edge',
            id: edgeId('embed_targets_file', eid, fileEntityId(targetFileId)),
            edgeType: 'embed_targets_file',
            src: eid,
            dst: fileEntityId(targetFileId),
          });

        if (kind === 'systemflow') {
          const ref = typeof spec?.ref === 'string' && spec.ref.trim() ? String(spec.ref).trim() : null;
          if (targetFileId && ref) {
            const sf = systemFlowEntityId(targetFileId, ref);
            edges.push({ type: 'edge', id: edgeId('embed_targets_system_flow', eid, sf), edgeType: 'embed_targets_system_flow', src: eid, dst: sf });
          }
        }
        if (kind === 'visionCard') {
          const cardId = typeof spec?.cardId === 'string' && spec.cardId.trim() ? String(spec.cardId).trim() : null;
          if (targetFileId && cardId) {
            const sid = visionShapeEntityId(targetFileId, cardId);
            edges.push({ type: 'edge', id: edgeId('embed_targets_vision_shape', eid, sid), edgeType: 'embed_targets_vision_shape', src: eid, dst: sid });
          }
        }

        const t = [
          `Note embed · ${kind}`,
          targetFileId ? `file:${targetFileId}` : '',
          kind === 'systemflow' ? `ref:${String(spec?.ref || '')}` : '',
          kind === 'visionCard' ? `card:${String(spec?.cardId || '')}` : '',
        ]
          .filter(Boolean)
          .join('\n');
        chunks.push({ type: 'chunk', id: chunkId(f.id, `noteEmbed:${embedId}`), fileId: f.id, fileKind: f.kind, text: t, anchor: `noteEmbed:${embedId}` });
        return;
      }

      if (lang === 'nexus-note-link') {
        const spec: any = parsed;
        const linkId =
          typeof spec?.id === 'string' && spec.id.trim()
            ? spec.id.trim()
            : startLineIndex >= 0
              ? `line-${startLineIndex}`
              : `line-unknown`;
        const lid = noteLinkEntityId(f.id, linkId);
        const targetFileId = typeof spec?.fileId === 'string' && spec.fileId.trim() ? String(spec.fileId).trim() : null;
        const blockId = typeof spec?.blockId === 'string' && spec.blockId.trim() ? String(spec.blockId).trim() : null;
        const label = typeof spec?.label === 'string' && spec.label.trim() ? String(spec.label).trim() : null;
        entities.push({ type: 'entity', id: lid, entityType: 'noteLink', fileId: f.id, linkId, targetFileId, blockId, label });
        edges.push({ type: 'edge', id: edgeId('file_has_note_link', fid, lid), edgeType: 'file_has_note_link', src: fid, dst: lid });
        if (targetFileId)
          edges.push({
            type: 'edge',
            id: edgeId('note_link_targets_file', lid, fileEntityId(targetFileId)),
            edgeType: 'note_link_targets_file',
            src: lid,
            dst: fileEntityId(targetFileId),
          });
        const t = [`Note link`, targetFileId ? `file:${targetFileId}` : '', blockId ? `#${blockId}` : '', label ? `label:${label}` : ''].filter(Boolean).join('\n');
        chunks.push({ type: 'chunk', id: chunkId(f.id, `noteLink:${linkId}`), fileId: f.id, fileKind: f.kind, text: t, anchor: `noteLink:${linkId}` });
      }
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? '';
      const m = line.match(/^```(\S+)?\s*$/);
      if (m) {
        if (!inFence) {
          inFence = true;
          fenceLang = String(m[1] || '');
          fenceStartLineIndex = i;
          buf = [];
        } else {
          inFence = false;
          flush(fenceStartLineIndex);
        }
        continue;
      }
      if (inFence) buf.push(line);
    }
  } catch {
    // ignore note block parse errors
  }
}

function exportDiagramSemanticKg(opts: {
  file: ProjectFileRow;
  fileEntity: string;
  projectFolderId: string;
  entities: KgEntityRecord[];
  edges: KgEdgeRecord[];
  chunks: EmbeddingChunkRecord[];
}) {
  const { file: f, fileEntity: fid, projectFolderId: rootProjectFolderId, entities, edges, chunks } = opts;
  const md = String(f.content || '');
  const roots = parseNexusMarkdown(md);
  const expids = extractExpandedIdsFromMarkdown(md);
  const rnByLine = extractRunningNumbersFromMarkdown(md);

  // Load semantic stores (tag-store, data-objects) for name/group resolution.
  const ydoc = new Y.Doc();
  ydoc.getText('nexus').insert(0, md);
  const tagStore = loadTagStore(ydoc);
  const dataObjectsStore = loadDataObjects(ydoc);
  const tagById = new Map(tagStore.tags.map((t) => [t.id, t]));
  const groupById = new Map(tagStore.groups.map((g) => [g.id, g]));
  void groupById;
  const attrByObjectId = new Map<
    string,
    Map<
      string,
      {
        id: string;
        name?: unknown;
        type?: unknown;
        values?: unknown;
        sample?: unknown;
      }
    >
  >();

  // Export tag groups + tags (project-scoped).
  for (const g of tagStore.groups || []) {
    const gid = tagGroupEntityId(rootProjectFolderId, g.id);
    entities.push({ type: 'entity', id: gid, entityType: 'tagGroup', projectFolderId: rootProjectFolderId, groupId: g.id, name: g.name, order: g.order });
  }
  for (const t of tagStore.tags || []) {
    const tid = tagEntityId(rootProjectFolderId, t.id);
    entities.push({
      type: 'entity',
      id: tid,
      entityType: 'tag',
      projectFolderId: rootProjectFolderId,
      tagId: t.id,
      name: t.name,
      groupId: t.groupId,
    });
    const gid = tagGroupEntityId(rootProjectFolderId, t.groupId);
    edges.push({ type: 'edge', id: edgeId('tag_in_group', tid, gid), edgeType: 'tag_in_group', src: tid, dst: gid });
  }

  // Export data objects + attributes (project-scoped).
  for (const o of dataObjectsStore.objects || []) {
    const oid = dataObjectEntityId(rootProjectFolderId, o.id);
    entities.push({
      type: 'entity',
      id: oid,
      entityType: 'dataObject',
      projectFolderId: rootProjectFolderId,
      dataObjectId: o.id,
      name: o.name,
      annotation: o.annotation || undefined,
      definedInFileId: f.id,
    });
    edges.push({ type: 'edge', id: edgeId('file_defines_data_object', fid, oid), edgeType: 'file_defines_data_object', src: fid, dst: oid });
    const attrs = loadDataObjectAttributes(o.data || {});
    const byAttrId = new Map<string, { id: string; name?: unknown; type?: unknown; values?: unknown; sample?: unknown }>();
    for (const a of attrs) {
      const aid = dataObjectAttrEntityId(rootProjectFolderId, o.id, a.id);
      byAttrId.set(a.id, { id: a.id, name: (a as any).name, type: (a as any).type, values: (a as any).values, sample: (a as any).sample });
      entities.push({
        type: 'entity',
        id: aid,
        entityType: 'dataObjectAttribute',
        projectFolderId: rootProjectFolderId,
        dataObjectId: o.id,
        attrId: a.id,
        name: (a as any).name,
        attrType: (a as any).type,
        values: (a as any).values,
        sample: (a as any).sample,
      });
      edges.push({ type: 'edge', id: edgeId('data_object_has_attribute', oid, aid), edgeType: 'data_object_has_attribute', src: oid, dst: aid });
    }
    attrByObjectId.set(o.id, byAttrId);
  }

  // Helper: map running number -> node entity id (best-effort).
  const runningToNodeEntityId = new Map<number, string>();

  const walk = (n: any) => {
    const expid = expids.get(n.lineIndex) ?? null;
    const nid = diagramNodeEntityId(f.id, n.lineIndex, expid);
    const rn = rnByLine.get(n.lineIndex);
    if (typeof rn === 'number' && Number.isFinite(rn) && !runningToNodeEntityId.has(rn)) runningToNodeEntityId.set(rn, nid);
    const tags = Array.isArray(n.tags) ? n.tags.map((t: any) => String(t).trim()).filter(Boolean) : [];
    const actorTagIds = tags.filter((id: string) => (tagById.get(id)?.groupId || '') === 'tg-actors' || /^actor-/.test(id));
    const uiSurfaceTagIds = tags.filter((id: string) => (tagById.get(id)?.groupId || '') === 'tg-uiSurface');

    const nodeRec: KgEntityRecord = {
      type: 'entity',
      id: nid,
      entityType: 'node',
      fileId: f.id,
      lineIndex: n.lineIndex,
      expid,
      content: n.content,
      annotation: (n as any).annotation || undefined,
      runningNumber: typeof rn === 'number' && Number.isFinite(rn) ? rn : undefined,
      tags: tags.length ? tags : undefined,
      isFlowNode: !!n.isFlowNode || undefined,
      isCommon: !!n.isCommon || undefined,
      conditions: (n as any).conditions || undefined,
      icon: typeof (n as any).icon === 'string' ? (n as any).icon : undefined,
      dataObjectId: typeof (n as any).dataObjectId === 'string' ? (n as any).dataObjectId : undefined,
      dataObjectAttributeIds: Array.isArray((n as any).dataObjectAttributeIds) ? (n as any).dataObjectAttributeIds : undefined,
      fid: typeof (n as any)?.metadata?.fid === 'string' ? (n as any).metadata.fid : undefined,
      sfid: typeof (n as any)?.metadata?.sfid === 'string' ? (n as any).metadata.sfid : undefined,
      uiSurfaceTagIds: uiSurfaceTagIds.length ? uiSurfaceTagIds : undefined,
      actorTagIds: actorTagIds.length ? actorTagIds : undefined,
    };
    entities.push(nodeRec);
    edges.push({ type: 'edge', id: edgeId('file_has_node', fid, nid), edgeType: 'file_has_node', src: fid, dst: nid });

    // Expanded UI (expanded-grid-N): export inner "grid nodes" as first-class entities.
    // This is where "tabs/wizard/content/etc" UI types live.
    if (typeof expid === 'number' && Number.isFinite(expid)) {
      try {
        const loaded = loadExpandedGridNodesFromDoc(ydoc, expid);
        const gridNodes = loaded?.nodes || [];
        const uiTypeCounts: Record<string, number> = {};
        for (const g of gridNodes) {
          const key = String(g.key || g.id || '').trim();
          if (!key) continue;
          const uiType = typeof (g as any).uiType === 'string' ? String((g as any).uiType).trim() : '';
          if (uiType) uiTypeCounts[uiType] = (uiTypeCounts[uiType] || 0) + 1;
          const gid = expandedGridNodeEntityId(f.id, expid, key);
          const uiTabsLabels = Array.isArray((g as any).uiTabs) ? (g as any).uiTabs.map((t: any) => String(t?.label || '').trim()).filter(Boolean) : [];
          const uiSectionsLabels = Array.isArray((g as any).uiSections) ? (g as any).uiSections.map((s: any) => String(s?.label || '').trim()).filter(Boolean) : [];
          entities.push({
            type: 'entity',
            id: gid,
            entityType: 'expandedGridNode',
            fileId: f.id,
            expid,
            key,
            content: String(g.content || ''),
            uiType: (g as any).uiType || undefined,
            icon: (g as any).icon || undefined,
            color: (g as any).color || undefined,
            dataObjectId: (g as any).dataObjectId || undefined,
            dataObjectAttributeIds: Array.isArray((g as any).dataObjectAttributeIds) ? (g as any).dataObjectAttributeIds : undefined,
            dataObjectAttributeMode: (g as any).dataObjectAttributeMode || undefined,
            relationKind: (g as any).relationKind || undefined,
            relationCardinality: (g as any).relationCardinality || undefined,
            gridX: (g as any).gridX,
            gridY: (g as any).gridY,
            gridWidth: (g as any).gridWidth,
            gridHeight: (g as any).gridHeight,
            uiTabsLabels: uiTabsLabels.length ? uiTabsLabels.slice(0, 12) : undefined,
            uiSectionsLabels: uiSectionsLabels.length ? uiSectionsLabels.slice(0, 12) : undefined,
            uiTabsCount: uiTabsLabels.length || undefined,
            uiSectionsCount: uiSectionsLabels.length || undefined,
            sourceChildDataObjectId: (g as any).sourceChildDataObjectId || undefined,
            sourceFlowNodeId: (g as any).sourceFlowNodeId || undefined,
          });
          const gridRec = entities[entities.length - 1] as any;
          edges.push({
            type: 'edge',
            id: edgeId('node_has_expanded_grid_node', nid, gid),
            edgeType: 'node_has_expanded_grid_node',
            src: nid,
            dst: gid,
          });

          // Optional semantic links to data objects.
          const doid = typeof (g as any).dataObjectId === 'string' ? String((g as any).dataObjectId).trim() : '';
          if (doid) {
            const did = dataObjectEntityId(rootProjectFolderId, doid);
            edges.push({ type: 'edge', id: edgeId('grid_node_about_data_object', gid, did), edgeType: 'grid_node_about_data_object', src: gid, dst: did });
          }
          const attrIds = Array.isArray((g as any).dataObjectAttributeIds) ? (g as any).dataObjectAttributeIds.map((x: any) => String(x).trim()).filter(Boolean) : [];
          if (doid && attrIds.length) {
            for (const a of attrIds) {
              const aid = dataObjectAttrEntityId(rootProjectFolderId, doid, a);
              edges.push({
                type: 'edge',
                id: edgeId('grid_node_touches_data_object_attr', gid, aid),
                edgeType: 'grid_node_touches_data_object_attr',
                src: gid,
                dst: aid,
              });
            }
          }
          if (doid && attrIds.length) {
            const byAttr = attrByObjectId.get(doid) || null;
            if (byAttr) {
              const snaps = attrIds
                .filter((a: string) => a !== '__objectName__')
                .map((a: string) => byAttr.get(a) || null)
                .filter(Boolean)
                .slice(0, 40);
              if (snaps.length) gridRec.dataObjectAttributeValues = snaps;
            }
          }
        }

        const types = Object.keys(uiTypeCounts);
        if (types.length) {
          (nodeRec as any).expandedUiTypes = types.sort((a, b) => a.localeCompare(b));
          (nodeRec as any).expandedUiTypeCounts = uiTypeCounts;
          (nodeRec as any).expandedGridNodeCount = gridNodes.length;
        } else if (gridNodes.length) {
          (nodeRec as any).expandedGridNodeCount = gridNodes.length;
        }
      } catch {
        // ignore expanded grid parse errors
      }
    }

    // Process flow graph (flow-node-N): export graph nodes + connectors for "before/next" semantics.
    if (n.isFlowNode && typeof rn === 'number' && Number.isFinite(rn)) {
      try {
        const flow = loadFlowNodeData(ydoc, rn);
        if (flow) {
          const graphNodes = flow.nodes || [];
          const nodeEntByFlowId = new Map<string, string>();
          for (const fn of graphNodes) {
            const fnid = flowGraphNodeEntityId(f.id, rn, String((fn as any).id || '').trim() || 'unknown');
            nodeEntByFlowId.set(String((fn as any).id || ''), fnid);
            entities.push({
              type: 'entity',
              id: fnid,
              entityType: 'flowGraphNode',
              fileId: f.id,
              runningNumber: rn,
              flowNodeId: (fn as any).id,
              label: (fn as any).label,
              flowNodeType: (fn as any).type,
              branchId: (fn as any).branchId,
              gotoTargetId: (fn as any).gotoTargetId,
              loopTargetId: (fn as any).loopTargetId,
              forkSourceId: (fn as any).forkSourceId,
            });
            edges.push({ type: 'edge', id: edgeId('node_has_flow_graph_node', nid, fnid), edgeType: 'node_has_flow_graph_node', src: nid, dst: fnid });
          }
          const labels = flow.edges || {};
          for (const k of Object.keys(labels)) {
            const [fromId, toId] = String(k).split('__');
            if (!fromId || !toId) continue;
            const srcEnt = nodeEntByFlowId.get(fromId);
            const dstEnt = nodeEntByFlowId.get(toId);
            if (!srcEnt || !dstEnt) continue;
            const meta = (labels as any)[k] || {};
            edges.push({
              type: 'edge',
              id: edgeId('flow_connector', srcEnt, dstEnt),
              edgeType: 'flow_connector',
              src: srcEnt,
              dst: dstEnt,
              label: typeof meta?.label === 'string' ? meta.label : '',
              color: typeof meta?.color === 'string' ? meta.color : '',
            });
          }
        }
      } catch {
        // ignore flow graph parse errors
      }
    }

    const textParts = [String(n.content || '').trim(), typeof (n as any).annotation === 'string' ? String((n as any).annotation).trim() : ''].filter(Boolean);
    const text = textParts.join('\n');
    if (text.trim()) {
      const anchor = expid ? `expid:${expid}` : `line:${n.lineIndex}`;
      chunks.push({ type: 'chunk', id: chunkId(f.id, anchor), fileId: f.id, fileKind: f.kind, text, anchor });
    }

    for (const t of tags) {
      const tid = tagEntityId(rootProjectFolderId, t);
      edges.push({ type: 'edge', id: edgeId('node_has_tag', nid, tid), edgeType: 'node_has_tag', src: nid, dst: tid });
    }
    // Semantic tag-derived edges (machine-checkable meaning per import rules).
    if (expid && uiSurfaceTagIds.length) {
      for (const t of uiSurfaceTagIds) {
        const tid = tagEntityId(rootProjectFolderId, t);
        edges.push({ type: 'edge', id: edgeId('screen_ui_surface', nid, tid), edgeType: 'screen_ui_surface', src: nid, dst: tid });
      }
    }
    if (n.isFlowNode && actorTagIds.length) {
      for (const t of actorTagIds) {
        const tid = tagEntityId(rootProjectFolderId, t);
        edges.push({ type: 'edge', id: edgeId('flow_actor', nid, tid), edgeType: 'flow_actor', src: nid, dst: tid });
      }
    }

    // Data object semantic edges.
    const doid = typeof (n as any).dataObjectId === 'string' ? String((n as any).dataObjectId).trim() : '';
    if (doid) {
      const did = dataObjectEntityId(rootProjectFolderId, doid);
      edges.push({ type: 'edge', id: edgeId('node_about_data_object', nid, did), edgeType: 'node_about_data_object', src: nid, dst: did });
    }
    const attrIds = Array.isArray((n as any).dataObjectAttributeIds) ? (n as any).dataObjectAttributeIds.map((x: any) => String(x).trim()).filter(Boolean) : [];
    if (doid && attrIds.length) {
      for (const a of attrIds) {
        const aid = dataObjectAttrEntityId(rootProjectFolderId, doid, a);
        edges.push({ type: 'edge', id: edgeId('node_touches_data_object_attr', nid, aid), edgeType: 'node_touches_data_object_attr', src: nid, dst: aid });
      }
    }
    if (doid && attrIds.length) {
      const byAttr = attrByObjectId.get(doid) || null;
      if (byAttr) {
        const snaps = attrIds
          .filter((a: string) => a !== '__objectName__')
          .map((a: string) => byAttr.get(a) || null)
          .filter(Boolean)
          .slice(0, 40);
        if (snaps.length) (nodeRec as any).dataObjectAttributeValues = snaps;
      }
    }

    (n.children || []).forEach((c: any) => {
      const cExpid = expids.get(c.lineIndex) ?? null;
      const cid = diagramNodeEntityId(f.id, c.lineIndex, cExpid);
      edges.push({ type: 'edge', id: edgeId('node_parent', nid, cid), edgeType: 'node_parent', src: nid, dst: cid });
      walk(c);
    });

    // Sequencing edges: preserve sibling order (useful for "before/next", especially under #flow# nodes).
    try {
      const children = Array.isArray(n.children) ? n.children : [];
      for (let i = 0; i + 1 < children.length; i += 1) {
        const a = children[i];
        const b = children[i + 1];
        if (!a || !b) continue;
        const aId = diagramNodeEntityId(f.id, a.lineIndex, expids.get(a.lineIndex) ?? null);
        const bId = diagramNodeEntityId(f.id, b.lineIndex, expids.get(b.lineIndex) ?? null);
        edges.push({ type: 'edge', id: edgeId('node_next_sibling', aId, bId), edgeType: 'node_next_sibling', src: aId, dst: bId });
        if (n.isFlowNode && a.isFlowNode && b.isFlowNode) {
          edges.push({ type: 'edge', id: edgeId('flow_tree_next', aId, bId), edgeType: 'flow_tree_next', src: aId, dst: bId });
        }
      }
    } catch {
      // ignore sibling ordering errors
    }
    if (n.isHub && Array.isArray(n.variants)) {
      (n.variants || []).forEach((v: any) => walk(v));
    }
  };
  roots.forEach(walk);

  // Custom connections (shortcuts/returns) are persisted in markdown and express non-tree diagram relationships.
  try {
    const m = md.match(/```custom-connections\n([\s\S]*?)\n```/);
    if (m && m[1]) {
      const parsed = JSON.parse(m[1]) as any[];
      if (Array.isArray(parsed)) {
        parsed.forEach((l: any) => {
          const type = String(l?.type || '').trim();
          const fromRunning = typeof l?.fromRunning === 'number' ? l.fromRunning : null;
          const toRunning = typeof l?.toRunning === 'number' ? l.toRunning : null;
          if (!fromRunning || !toRunning) return;
          const srcNode = runningToNodeEntityId.get(fromRunning) || null;
          const dstNode = runningToNodeEntityId.get(toRunning) || null;
          if (!srcNode || !dstNode) return;
          const et = type === 'return' ? 'node_return_to' : 'node_shortcut_to';
          edges.push({
            type: 'edge',
            id: edgeId(et, srcNode, dstNode),
            edgeType: et,
            src: srcNode,
            dst: dstNode,
            fromRunning,
            toRunning,
          });
        });
      }
    }
  } catch {
    // ignore custom connection parse errors
  }

  // System flow blocks: export boxes + links (semantic relationships across a different “presentation” of the same system).
  try {
    const sfids = new Set<string>();
    const collect = (n: any) => {
      const sfid = typeof n?.metadata?.sfid === 'string' ? String(n.metadata.sfid).trim() : '';
      const isRoot = !!n?.metadata?.systemFlow;
      if (sfid && isRoot) sfids.add(sfid);
      (n.children || []).forEach(collect);
      if (n.isHub && Array.isArray(n.variants)) (n.variants || []).forEach(collect);
    };
    roots.forEach(collect);
    sfids.forEach((sfid) => {
      const sf = loadSystemFlowStateFromMarkdown(md, sfid);
      const sfEnt = systemFlowEntityId(f.id, sfid);
      entities.push({ type: 'entity', id: sfEnt, entityType: 'systemFlow', fileId: f.id, sfid, version: (sf as any)?.version });
      edges.push({ type: 'edge', id: edgeId('file_has_system_flow', fid, sfEnt), edgeType: 'file_has_system_flow', src: fid, dst: sfEnt });
      (sf.boxes || []).forEach((b: any) => {
        const bid = systemFlowBoxEntityId(f.id, sfid, String(b.key || ''));
        entities.push({
          type: 'entity',
          id: bid,
          entityType: 'systemFlowBox',
          fileId: f.id,
          sfid,
          boxKey: b.key,
          name: b.name,
          annotation: b.annotation,
          color: b.color,
          icon: b.icon,
          gridX: b.gridX,
          gridY: b.gridY,
          gridWidth: b.gridWidth,
          gridHeight: b.gridHeight,
        });
        edges.push({ type: 'edge', id: edgeId('system_flow_has_box', sfEnt, bid), edgeType: 'system_flow_has_box', src: sfEnt, dst: bid });
        const doId = typeof b.dataObjectId === 'string' ? String(b.dataObjectId).trim() : '';
        if (doId) {
          const did = dataObjectEntityId(rootProjectFolderId, doId);
          edges.push({ type: 'edge', id: edgeId('box_about_data_object', bid, did), edgeType: 'box_about_data_object', src: bid, dst: did });
        }
        const attrIds = Array.isArray(b.dataObjectAttributeIds) ? b.dataObjectAttributeIds.map((x: any) => String(x).trim()).filter(Boolean) : [];
        if (doId && attrIds.length) {
          attrIds.forEach((a: string) => {
            const aid = dataObjectAttrEntityId(rootProjectFolderId, doId, a);
            edges.push({ type: 'edge', id: edgeId('box_touches_data_object_attr', bid, aid), edgeType: 'box_touches_data_object_attr', src: bid, dst: aid });
          });
        }
        const chunkText = String([`SystemFlow box: ${b.name || b.key}`, b.annotation || ''].filter(Boolean).join('\n')).trim();
        if (chunkText) chunks.push({ type: 'chunk', id: chunkId(f.id, `systemflow:${sfid}:box:${b.key}`), fileId: f.id, fileKind: f.kind, text: chunkText, anchor: `systemflow:${sfid}:box:${b.key}` });
      });
      (sf.links || []).forEach((l: any) => {
        const lid = systemFlowLinkEntityId(f.id, sfid, String(l.id || ''));
        entities.push({
          type: 'entity',
          id: lid,
          entityType: 'systemFlowLink',
          fileId: f.id,
          sfid,
          linkId: l.id,
          fromKey: l.fromKey,
          toKey: l.toKey,
          text: l.text,
          dashStyle: l.dashStyle,
          startShape: l.startShape,
          endShape: l.endShape,
          points: l.points,
        });
        edges.push({ type: 'edge', id: edgeId('system_flow_has_link', sfEnt, lid), edgeType: 'system_flow_has_link', src: sfEnt, dst: lid });
        const fromBox = systemFlowBoxEntityId(f.id, sfid, String(l.fromKey || ''));
        const toBox = systemFlowBoxEntityId(f.id, sfid, String(l.toKey || ''));
        edges.push({ type: 'edge', id: edgeId('link_from', lid, fromBox), edgeType: 'link_from', src: lid, dst: fromBox });
        edges.push({ type: 'edge', id: edgeId('link_to', lid, toBox), edgeType: 'link_to', src: lid, dst: toBox });
        const t = String(l.text || '').trim();
        if (t) chunks.push({ type: 'chunk', id: chunkId(f.id, `systemflow:${sfid}:link:${l.id}`), fileId: f.id, fileKind: f.kind, text: `SystemFlow link: ${t}`, anchor: `systemflow:${sfid}:link:${l.id}` });
      });
    });
  } catch {
    // ignore systemflow parse errors
  }
}

export async function exportKgAndVectorsForProject(res: {
  supabaseMode: boolean;
  supabase: SupabaseClient | null;
  projectFolderId: string | null;
}): Promise<{
  graphJsonl: string;
  embeddingsJsonl: string;
  stats: { files: number; entities: number; edges: number; chunks: number };
}> {
  if (!res.projectFolderId) throw new Error('Export requires an active project folder.');

  // Allow callers to pass any folder inside a project (e.g. "Templates"). Walk up to the project root.
  const resolveRootFolderIdLocal = (folderId: string): string => {
    const store = ensureLocalFileStore();
    const byId = new Map(store.folders.map((f) => [f.id, f]));
    let cur = folderId;
    let guard = 0;
    while (guard++ < 1000) {
      const f = byId.get(cur);
      const parent = f?.parentId ? String(f.parentId) : null;
      if (!parent) return cur;
      cur = parent;
    }
    return folderId;
  };

  const resolveRootFolderIdSupabase = async (supabase: SupabaseClient, folderId: string): Promise<string> => {
    let cur = folderId;
    let guard = 0;
    while (guard++ < 200) {
      const { data, error } = await supabase.from('folders').select('id,parent_id').eq('id', cur).maybeSingle();
      if (error) throw error;
      const parent = (data as any)?.parent_id ? String((data as any).parent_id) : null;
      if (!parent) return cur;
      cur = parent;
    }
    return folderId;
  };

  const rootProjectFolderId = res.supabaseMode
    ? await (async () => {
        if (!res.supabase) throw new Error('Not connected to Supabase.');
        return await resolveRootFolderIdSupabase(res.supabase, res.projectFolderId!);
      })()
    : resolveRootFolderIdLocal(res.projectFolderId!);

  const files: ProjectFileRow[] = res.supabaseMode
    ? await (async () => {
        if (!res.supabase) throw new Error('Not connected to Supabase.');
        const folderIds = await listProjectFolderIdsSupabase(res.supabase, rootProjectFolderId);
        return await listProjectFilesSupabase(res.supabase, folderIds);
      })()
    : (() => {
        const folderIds = listProjectFolderIdsLocal(rootProjectFolderId);
        return listProjectFilesLocal(folderIds);
      })();

  const entities: KgEntityRecord[] = [];
  const edges: KgEdgeRecord[] = [];
  const chunks: EmbeddingChunkRecord[] = [];

  for (const f of files) {
    const fid = fileEntityId(f.id);
    entities.push({
      type: 'entity',
      id: fid,
      entityType: 'file',
      fileId: f.id,
      name: f.name,
      kind: f.kind,
      folderId: f.folderId,
    });

    // Template file
    if (f.kind === 'template') {
      const { header, rest } = readTemplateHeader(f.content || '');
      const tid = templateEntityId(f.id);
      entities.push({
        type: 'entity',
        id: tid,
        entityType: 'template',
        fileId: f.id,
        name: header?.name || f.name,
        targetKind: header?.targetKind || null,
        mode: header?.mode || null,
        fragmentKind: header?.fragmentKind || null,
      });
      edges.push({ type: 'edge', id: edgeId('file_has_template', fid, tid), edgeType: 'file_has_template', src: fid, dst: tid });
      const text = String([header?.name || f.name, header?.description || '', rest || ''].filter(Boolean).join('\n')).trim();
      if (text) chunks.push({ type: 'chunk', id: chunkId(f.id, 'template'), fileId: f.id, fileKind: f.kind, text, anchor: 'template' });
      continue;
    }

    // Test file
    if (f.kind === 'test') {
      const loaded = loadTestDoc(f.content || '').doc;
      const tid = testEntityId(f.id);
      entities.push({
        type: 'entity',
        id: tid,
        entityType: 'test',
        fileId: f.id,
        name: loaded?.name || f.name,
        sourceFileId: loaded?.sourceFileId || null,
        flowRootId: loaded?.flowRootId || null,
        flowNodeId: loaded?.flowNodeId || null,
      });
      edges.push({ type: 'edge', id: edgeId('file_has_test', fid, tid), edgeType: 'file_has_test', src: fid, dst: tid });
      if (loaded?.sourceFileId) {
        edges.push({
          type: 'edge',
          id: edgeId('test_source_file', tid, fileEntityId(loaded.sourceFileId)),
          edgeType: 'test_source_file',
          src: tid,
          dst: fileEntityId(loaded.sourceFileId),
        });
      }
      const text = loaded
        ? `Test: ${loaded.name}\nFlow node: ${loaded.flowNodeId}\nFlow root: ${loaded.flowRootId}`
        : `Test file: ${f.name}`;
      chunks.push({ type: 'chunk', id: chunkId(f.id, 'test'), fileId: f.id, fileKind: f.kind, text, anchor: 'test' });
      continue;
    }

    // Vision file: semantic shapes + cards.
    if (f.kind === 'vision') {
      exportVisionSemanticKg({ file: f, fileEntity: fid, entities, edges, chunks });
      continue;
    }

    // Note file: export headings as entities + chunks.
    if (f.kind === 'note') {
      exportNoteSemanticKg({ file: f, fileEntity: fid, entities, edges, chunks });
      continue;
    }

    // Diagram file: export parsed nodes + parent/child edges + tags.
    if (f.kind === 'diagram') {
      exportDiagramSemanticKg({ file: f, fileEntity: fid, projectFolderId: rootProjectFolderId, entities, edges, chunks });
      continue;
    }

    // Other kinds (grid/etc): file-only chunk.
    const fallbackText = String(f.content || '').trim();
    if (fallbackText) chunks.push({ type: 'chunk', id: chunkId(f.id, 'file'), fileId: f.id, fileKind: f.kind, text: fallbackText.slice(0, 50_000), anchor: 'file' });
  }

  // Deduplicate by id (best-effort; preserves first occurrence).
  const uniq = <T extends { id: string }>(arr: T[]) => {
    const seen = new Set<string>();
    const out: T[] = [];
    for (const x of arr) {
      if (!x?.id) continue;
      if (seen.has(x.id)) continue;
      seen.add(x.id);
      out.push(x);
    }
    return out;
  };

  const ent = uniq(entities);
  const edg = uniq(edges);
  const chk = uniq(chunks);

  const graphJsonl = [...ent, ...edg].map((r) => JSON.stringify(r)).join('\n') + '\n';
  const embeddingsJsonl = chk.map((c) => JSON.stringify(c)).join('\n') + '\n';

  return {
    graphJsonl,
    embeddingsJsonl,
    stats: { files: files.length, entities: ent.length, edges: edg.length, chunks: chk.length },
  };
}

export function downloadKgVectors(res: { graphJsonl: string; embeddingsJsonl: string; basename?: string }) {
  const base = String(res.basename || 'nexus-export').trim() || 'nexus-export';
  downloadTextFile(`${base}.graph.jsonl`, res.graphJsonl, 'application/x-ndjson;charset=utf-8');
  downloadTextFile(`${base}.embeddings.jsonl`, res.embeddingsJsonl, 'application/x-ndjson;charset=utf-8');
}

