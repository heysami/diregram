'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import * as Y from 'yjs';
import { X } from 'lucide-react';
import type { AsyncTrackedJob } from '@/hooks/use-async-job-queue';
import type {
  DiagramAssistAttributeSuggestion,
  DiagramAssistDataObjectAttributesProposal,
  DiagramAssistNodeStructureProposal,
  DiagramAssistProposal,
  DiagramAssistStatusDescriptionsProposal,
} from '@/lib/diagram-ai-assist-types';
import {
  replaceSubtreeMarkdownAtLineIndex,
  resolveNodeByRelativePath,
  sha256Hex,
} from '@/lib/diagram-ai-assist-client';
import { validateNexusMarkdownImport } from '@/lib/markdown-import-validator';
import { parseNexusMarkdown } from '@/lib/nexus-parser';
import { buildProcessRunningNumberMap } from '@/lib/process-running-number-map';
import { saveProcessNodeType } from '@/lib/process-node-type-storage';
import { saveSingleScreenLastStep } from '@/lib/process-single-screen-storage';
import { loadConnectorLabels, saveConnectorLabels } from '@/lib/process-connector-labels';
import { ensureDataObject, loadDataObjects, upsertDataObject } from '@/lib/data-object-storage';
import {
  loadDataObjectAttributes,
  newDataObjectAttributeId,
  upsertDataObjectAttributes,
  type DataObjectAttribute,
} from '@/lib/data-object-attributes';
import {
  upsertDataObjectAttributeDescription,
} from '@/lib/data-object-attribute-descriptions';
import { upsertDimensionDescription } from '@/lib/dimension-descriptions';
import { serializeTableToMarkdown } from '@/lib/table-serialization';
import type { TableColumn, TableRow } from '@/components/DimensionTableEditor';
import type { ImportValidationIssue } from '@/lib/markdown-import-validator';

function asRecord(input: unknown): Record<string, unknown> | null {
  return input && typeof input === 'object' ? (input as Record<string, unknown>) : null;
}

function parseProposal(job: AsyncTrackedJob | null): DiagramAssistProposal | null {
  if (!job) return null;
  const result = asRecord(job.result);
  const proposal = asRecord(result?.proposal);
  if (!proposal) return null;
  const action = String(proposal.action || '').trim();
  if (action !== 'node_structure' && action !== 'data_object_attributes' && action !== 'status_descriptions') return null;
  return proposal as DiagramAssistProposal;
}

function parseValidationIssueText(raw: string): ImportValidationIssue {
  const text = String(raw || '').trim();
  const sep = text.indexOf(':');
  if (sep <= 0) {
    return {
      severity: 'error',
      code: 'VALIDATION_ERROR',
      message: text || 'Validation failed.',
    };
  }
  return {
    severity: 'error',
    code: text.slice(0, sep).trim() || 'VALIDATION_ERROR',
    message: text.slice(sep + 1).trim() || 'Validation failed.',
  };
}

function formatValidationIssueForUser(issue: ImportValidationIssue): string {
  const code = String(issue.code || '').trim();
  if (code === 'UNCLOSED_CODE_BLOCK') {
    return `AI output has an unfinished code block fence (\`\`\`). No changes were applied. ${issue.message}`;
  }
  if (code === 'PARSE_FAILED' || code === 'NO_NODES') {
    return `AI output could not be parsed as a valid diagram subtree. No changes were applied. ${issue.message}`;
  }
  return `AI output failed validation (${code || 'VALIDATION_ERROR'}). No changes were applied. ${issue.message}`;
}

function normalizeIdentity(name: string, type: 'text' | 'status'): string {
  const cleaned = String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
  return `${cleaned}::${type}`;
}

function clampColor(input: string | undefined): string {
  const v = String(input || '').trim();
  if (/^#[0-9a-fA-F]{6}$/.test(v)) return v;
  return '#000000';
}

function buildNodeMap(roots: ReturnType<typeof parseNexusMarkdown>): Map<string, (typeof roots)[number]> {
  const map = new Map<string, (typeof roots)[number]>();
  const walk = (nodes: ReturnType<typeof parseNexusMarkdown>) => {
    nodes.forEach((n) => {
      map.set(n.id, n);
      if (n.isHub && n.variants) {
        n.variants.forEach((v) => {
          map.set(v.id, v as (typeof roots)[number]);
          walk(v.children as ReturnType<typeof parseNexusMarkdown>);
        });
      } else {
        walk(n.children as ReturnType<typeof parseNexusMarkdown>);
      }
    });
  };
  walk(roots);
  return map;
}

function findNodeByLineIndex(roots: ReturnType<typeof parseNexusMarkdown>, lineIndex: number) {
  let found: (typeof roots)[number] | null = null;
  const walk = (nodes: ReturnType<typeof parseNexusMarkdown>) => {
    for (const n of nodes) {
      if (n.lineIndex === lineIndex) {
        found = n;
        return;
      }
      if (n.isHub && n.variants) {
        const directVariant = n.variants.find((v) => v.lineIndex === lineIndex) || null;
        if (directVariant) {
          found = directVariant as (typeof roots)[number];
          return;
        }
        walk(n.variants.flatMap((v) => v.children) as ReturnType<typeof parseNexusMarkdown>);
      } else {
        walk(n.children as ReturnType<typeof parseNexusMarkdown>);
      }
      if (found) return;
    }
  };
  walk(roots);
  return found;
}

function buildFlowLinesFromStateMachine(p: DiagramAssistStatusDescriptionsProposal): string[] {
  if (p.flowMarkdownLines.length) return p.flowMarkdownLines;
  const title = p.target.kind === 'data_object_status'
    ? `${p.target.doName} – ${p.target.attrName} #flow#`
    : `${p.target.hubLabel} – ${p.target.dimensionKey} #flow#`;
  const lines = [title];
  p.stateMachine.transitions.slice(0, 60).forEach((t) => {
    const labelParts = [t.from, '->', t.to, t.guard ? `(${t.guard})` : ''].filter(Boolean);
    lines.push(`  ${labelParts.join(' ')} #flow#`);
  });
  if (lines.length === 1 && p.stateMachine.states.length) {
    p.stateMachine.states.forEach((s) => lines.push(`  ${s} #flow#`));
  }
  return lines;
}

function buildTableJsonLines(p: DiagramAssistStatusDescriptionsProposal): string[] {
  const columnsRaw = p.table.columns && p.table.columns.length
    ? p.table.columns
    : ['Role', 'Status', 'Actions', 'Field access'];
  const columns: TableColumn[] = columnsRaw.slice(0, 6).map((label, idx) => ({ id: `col-${idx + 1}`, label }));
  const rows: TableRow[] = p.table.rows.slice(0, 200).map((r, idx) => {
    const cells: Record<string, string> = {};
    if (columns[0]) cells[columns[0].id] = r.role;
    if (columns[1]) cells[columns[1].id] = r.status;
    if (columns[2]) cells[columns[2].id] = r.actions;
    if (columns[3]) cells[columns[3].id] = r.fieldAccess;
    return {
      id: `row-${idx + 1}`,
      label: `Row ${idx + 1}`,
      rowType: 'content',
      cells,
    };
  });
  const dimensionValues = p.target.statusValues || [];
  return serializeTableToMarkdown(columns, rows, null, dimensionValues);
}

export function DiagramAiProposalModal({
  job,
  doc,
  onClose,
}: {
  job: AsyncTrackedJob | null;
  doc: Y.Doc;
  onClose: () => void;
}) {
  const proposal = useMemo(() => parseProposal(job), [job]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [ownerBySuggestion, setOwnerBySuggestion] = useState<Record<string, string>>({});
  const [dataObjectOptions, setDataObjectOptions] = useState<Array<{ id: string; name: string }>>([]);

  useEffect(() => {
    if (!job) return;
    const yText = doc.getText('nexus');
    const sync = () => {
      const store = loadDataObjects(doc);
      setDataObjectOptions(store.objects.map((o) => ({ id: o.id, name: o.name || o.id })));
    };
    sync();
    yText.observe(sync);
    return () => yText.unobserve(sync);
  }, [doc, job]);

  useEffect(() => {
    if (!proposal || proposal.action !== 'data_object_attributes') {
      setOwnerBySuggestion({});
      return;
    }
    const next: Record<string, string> = {};
    proposal.attributes.forEach((a, idx) => {
      const key = `${idx}:${a.name}`;
      next[key] = a.ownerObjectId || proposal.targetObjectId;
    });
    setOwnerBySuggestion(next);
  }, [proposal]);

  const ensureNoConflict = useCallback(async (baseFileHash: string) => {
    const current = doc.getText('nexus').toString();
    const hash = await sha256Hex(current);
    if (hash !== String(baseFileHash || '').trim()) {
      throw new Error('File changed since analysis snapshot. Re-analyze required.');
    }
    return current;
  }, [doc]);

  const applyNodeStructure = useCallback(async (p: DiagramAssistNodeStructureProposal) => {
    const current = await ensureNoConflict(p.baseFileHash);
    const lineIndex = Number(p.preview?.lineIndex ?? -1);
    if (!Number.isFinite(lineIndex) || lineIndex < 0) {
      throw new Error('Missing node anchor line index in proposal preview.');
    }

    const replaced = replaceSubtreeMarkdownAtLineIndex({
      markdown: current,
      lineIndex,
      subtreeReplacementMarkdown: p.subtreeReplacementMarkdown,
    });

    const validation = validateNexusMarkdownImport(replaced.markdown);
    if (validation.errors.length) {
      const first = validation.errors[0];
      const detail = formatValidationIssueForUser(first);
      const more = validation.errors.length > 1 ? ` (${validation.errors.length - 1} more validation error(s))` : '';
      throw new Error(`${detail}${more} Please run AI Structure Review again.`);
    }

    const yText = doc.getText('nexus');
    doc.transact(() => {
      yText.delete(0, yText.length);
      yText.insert(0, replaced.markdown);
    });

    const metadataOps = p.metadataOps;
    if (!metadataOps) return;

    const markdownAfter = yText.toString();
    const roots = parseNexusMarkdown(markdownAfter);
    const rootNode = findNodeByLineIndex(roots, lineIndex);
    if (!rootNode) return;

    const nodeMap = buildNodeMap(roots);
    let processMap = buildProcessRunningNumberMap({ doc, roots });
    const getProcessNumber = (nodeId: string) => processMap.get(nodeId);

    (metadataOps.processNodeTypes || []).forEach((op) => {
      const target = resolveNodeByRelativePath(rootNode, op.nodePath || []);
      if (!target || !target.isFlowNode) return;
      saveProcessNodeType(doc, target.id, op.type, target, nodeMap, roots, getProcessNumber);
      // Refresh map because saveProcessNodeType may update registry.
      const refreshedRoots = parseNexusMarkdown(doc.getText('nexus').toString());
      processMap = buildProcessRunningNumberMap({ doc, roots: refreshedRoots });
    });

    const rootsAfterType = parseNexusMarkdown(doc.getText('nexus').toString());
    const refreshedRoot = findNodeByLineIndex(rootsAfterType, lineIndex) || rootNode;
    const refreshedProcessMap = buildProcessRunningNumberMap({ doc, roots: rootsAfterType });

    (metadataOps.singleScreenLastSteps || []).forEach((op) => {
      const start = resolveNodeByRelativePath(refreshedRoot, op.startPath || []);
      const last = resolveNodeByRelativePath(refreshedRoot, op.lastPath || []);
      if (!start || !last) return;
      const startRn = refreshedProcessMap.get(start.id);
      const lastRn = refreshedProcessMap.get(last.id);
      saveSingleScreenLastStep(doc, startRn, lastRn);
    });

    if ((metadataOps.connectorLabels || []).length) {
      const labels = loadConnectorLabels(doc);
      (metadataOps.connectorLabels || []).forEach((op) => {
        const from = resolveNodeByRelativePath(refreshedRoot, op.fromPath || []);
        const to = resolveNodeByRelativePath(refreshedRoot, op.toPath || []);
        if (!from || !to) return;
        labels[`${from.id}__${to.id}`] = { label: op.label, color: clampColor(op.color) };
      });
      saveConnectorLabels(doc, labels);
    }
  }, [doc, ensureNoConflict]);

  const applyDataObjectAttributes = useCallback(async (p: DiagramAssistDataObjectAttributesProposal) => {
    await ensureNoConflict(p.baseFileHash);
    const attrsByOwner = new Map<string, DiagramAssistAttributeSuggestion[]>();

    p.attributes.forEach((a, idx) => {
      const key = `${idx}:${a.name}`;
      const owner = String(ownerBySuggestion[key] || a.ownerObjectId || p.targetObjectId || '').trim();
      if (!owner) return;
      const list = attrsByOwner.get(owner) || [];
      list.push(a);
      attrsByOwner.set(owner, list);
    });

    attrsByOwner.forEach((suggestions, ownerId) => {
      const ownerName =
        dataObjectOptions.find((o) => o.id === ownerId)?.name ||
        suggestions.find((s) => s.ownerObjectId === ownerId)?.ownerObjectName ||
        ownerId;
      const obj = ensureDataObject(doc, ownerId, ownerName);
      const existing = loadDataObjectAttributes(obj.data);
      const byIdentity = new Map<string, DataObjectAttribute>();

      existing.forEach((a) => {
        const t = a.type === 'status' ? 'status' : 'text';
        byIdentity.set(normalizeIdentity(a.name, t), a);
      });

      suggestions.forEach((s) => {
        const type = s.type === 'status' ? 'status' : 'text';
        const identity = normalizeIdentity(s.name, type);
        const found = byIdentity.get(identity);
        if (!found) {
          const next: DataObjectAttribute =
            type === 'status'
              ? {
                  id: newDataObjectAttributeId(),
                  name: s.name,
                  type: 'status',
                  values: (s.statusValues || []).map((v) => String(v || '').trim()).filter(Boolean),
                  sample: s.sample || undefined,
                }
              : {
                  id: newDataObjectAttributeId(),
                  name: s.name,
                  type: 'text',
                  sample: s.sample || undefined,
                };
          byIdentity.set(identity, next);
          return;
        }

        if (found.type === 'status') {
          const merged = Array.from(new Set([...(found.values || []), ...((s.statusValues || []).map((v) => String(v || '').trim()).filter(Boolean))]));
          byIdentity.set(identity, {
            ...found,
            values: merged,
            sample: found.sample || s.sample || undefined,
          });
          return;
        }

        byIdentity.set(identity, {
          ...found,
          sample: found.sample || s.sample || undefined,
        });
      });

      const merged = Array.from(byIdentity.values());
      const nextData = upsertDataObjectAttributes(obj.data, merged);
      upsertDataObject(doc, { ...obj, data: nextData });
    });
  }, [dataObjectOptions, doc, ensureNoConflict, ownerBySuggestion]);

  const applyStatusDescriptions = useCallback(async (p: DiagramAssistStatusDescriptionsProposal) => {
    const current = await ensureNoConflict(p.baseFileHash);
    const flowLines = buildFlowLinesFromStateMachine(p);
    const tableLines = buildTableJsonLines(p);

    let next = current;
    if (p.target.kind === 'data_object_status') {
      const id = `${p.target.doId}::${p.target.attrId}`;
      const label = `${p.target.doName} – ${p.target.attrName}`;
      next = upsertDataObjectAttributeDescription(next, {
        id,
        label,
        mode: 'flow',
        bodyLines: flowLines,
      });
      next = upsertDataObjectAttributeDescription(next, {
        id,
        label,
        mode: 'table',
        bodyLines: tableLines,
      });
    } else {
      const id = `${p.target.nodeId}::${p.target.dimensionKey}`;
      const hubLabel = `${p.target.hubLabel} – ${p.target.dimensionKey}`;
      next = upsertDimensionDescription(next, {
        id,
        hubLabel,
        mode: 'flow',
        bodyLines: flowLines,
      });
      next = upsertDimensionDescription(next, {
        id,
        hubLabel,
        mode: 'table',
        bodyLines: tableLines,
      });
    }

    if (next === current) return;
    const yText = doc.getText('nexus');
    doc.transact(() => {
      yText.delete(0, yText.length);
      yText.insert(0, next);
    });
  }, [doc, ensureNoConflict]);

  const onApply = useCallback(async () => {
    if (!proposal) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      if (proposal.action === 'node_structure') {
        if (proposal.validationReport?.errors?.length) {
          const firstIssue = parseValidationIssueText(proposal.validationReport.errors[0]);
          throw new Error(`${formatValidationIssueForUser(firstIssue)} Please run AI Structure Review again.`);
        }
        await applyNodeStructure(proposal);
      } else if (proposal.action === 'data_object_attributes') {
        await applyDataObjectAttributes(proposal);
      } else {
        await applyStatusDescriptions(proposal);
      }
      setSuccess('Applied proposal successfully.');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e || 'Failed to apply proposal'));
    } finally {
      setBusy(false);
    }
  }, [applyDataObjectAttributes, applyNodeStructure, applyStatusDescriptions, proposal]);

  if (!job) return null;
  const hasBlockingValidationErrors =
    proposal?.action === 'node_structure' && (proposal.validationReport?.errors?.length || 0) > 0;

  return (
    <div className="fixed inset-0 z-[1400] bg-black/45 flex items-center justify-center p-4">
      <div className="mac-window max-w-5xl w-[95vw] max-h-[92vh] flex flex-col overflow-hidden">
        <div className="mac-titlebar">
          <div className="mac-title">Diagram AI Proposal</div>
          <div className="absolute right-1 top-1/2 -translate-y-1/2">
            <button type="button" className="mac-btn" onClick={onClose} title="Close">
              <X size={14} />
            </button>
          </div>
        </div>

        <div className="px-4 py-2 border-b text-xs">
          <div className="font-semibold">{job.title}</div>
          <div className="opacity-70">Job #{job.id.slice(0, 8)}</div>
        </div>

        <div className="p-4 overflow-auto flex-1 text-xs space-y-3">
          {!proposal ? (
            <div className="mac-double-outline p-3">
              This job did not return a recognized proposal payload.
            </div>
          ) : null}

          {proposal?.action === 'node_structure' ? (
            <div className="space-y-3">
              <div className="mac-double-outline p-3">
                <div className="font-semibold">Diagnosis</div>
                <div className="mt-1 whitespace-pre-wrap">{proposal.diagnosis}</div>
              </div>
              {proposal.recommendations.length ? (
                <div className="mac-double-outline p-3">
                  <div className="font-semibold">Recommendations</div>
                  <ul className="mt-1 list-disc pl-5">
                    {proposal.recommendations.map((r, idx) => <li key={`${idx}:${r}`}>{r}</li>)}
                  </ul>
                </div>
              ) : null}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="mac-double-outline p-3">
                  <div className="font-semibold">Current Subtree</div>
                  <pre className="mt-1 whitespace-pre-wrap bg-white border p-2 rounded">{proposal.preview?.originalSubtreeMarkdown || '(unavailable)'}</pre>
                </div>
                <div className="mac-double-outline p-3">
                  <div className="font-semibold">Proposed Subtree</div>
                  <pre className="mt-1 whitespace-pre-wrap bg-white border p-2 rounded">{proposal.subtreeReplacementMarkdown}</pre>
                </div>
              </div>
              {proposal.validationReport ? (
                <div className="mac-double-outline p-3">
                  <div className="font-semibold">Validation Preview</div>
                  <div className="mt-1">Errors: {proposal.validationReport.errors.length}</div>
                  <div>Warnings: {proposal.validationReport.warnings.length}</div>
                  {proposal.validationReport.errors.length ? (
                    <div className="mt-2">
                      <div className="font-medium text-red-700">Blocking issues</div>
                      <ul className="mt-1 list-disc pl-5 text-red-700">
                        {proposal.validationReport.errors.slice(0, 3).map((raw, idx) => {
                          const issue = parseValidationIssueText(raw);
                          return <li key={`ve-${idx}`}>{formatValidationIssueForUser(issue)}</li>;
                        })}
                      </ul>
                      {proposal.validationReport.errors.length > 3 ? (
                        <div className="mt-1 text-red-700">
                          +{proposal.validationReport.errors.length - 3} more blocking issue(s)
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  {proposal.validationReport.warnings.length ? (
                    <div className="mt-2">
                      <div className="font-medium">Warnings</div>
                      <ul className="mt-1 list-disc pl-5">
                        {proposal.validationReport.warnings.slice(0, 3).map((w, idx) => <li key={`vw-${idx}`}>{w}</li>)}
                      </ul>
                      {proposal.validationReport.warnings.length > 3 ? (
                        <div className="mt-1">+{proposal.validationReport.warnings.length - 3} more warning(s)</div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

          {proposal?.action === 'data_object_attributes' ? (
            <div className="space-y-3">
              <div className="mac-double-outline p-3">
                <div className="font-semibold">Summary</div>
                <div className="mt-1 whitespace-pre-wrap">{proposal.summary}</div>
              </div>
              <div className="mac-double-outline p-3">
                <div className="font-semibold">Attribute Suggestions ({proposal.attributes.length})</div>
                <div className="mt-2 space-y-2">
                  {proposal.attributes.map((a, idx) => {
                    const key = `${idx}:${a.name}`;
                    return (
                      <div key={key} className="border rounded p-2 bg-white space-y-1">
                        <div className="font-medium">{a.name} <span className="opacity-60">({a.type})</span></div>
                        {a.sample ? <div>Sample: <span className="font-mono">{a.sample}</span></div> : null}
                        {a.type === 'status' && (a.statusValues || []).length ? (
                          <div>Status values: {(a.statusValues || []).join(', ')}</div>
                        ) : null}
                        <div className="flex items-center gap-2">
                          <label className="opacity-70">Owner object</label>
                          <select
                            className="mac-field"
                            value={ownerBySuggestion[key] || a.ownerObjectId || proposal.targetObjectId}
                            onChange={(e) => setOwnerBySuggestion((prev) => ({ ...prev, [key]: e.target.value }))}
                          >
                            {dataObjectOptions.map((o) => (
                              <option key={o.id} value={o.id}>
                                {o.name} ({o.id})
                              </option>
                            ))}
                          </select>
                          <span className="opacity-60">{Math.round((a.ownerConfidence || 0) * 100)}%</span>
                        </div>
                        {a.ownerReason ? <div className="opacity-80">Reason: {a.ownerReason}</div> : null}
                        {(a.evidenceSnippets || []).length ? (
                          <ul className="list-disc pl-5 opacity-80">
                            {a.evidenceSnippets?.map((s, i) => <li key={`${key}:ev:${i}`}>{s}</li>)}
                          </ul>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : null}

          {proposal?.action === 'status_descriptions' ? (
            <div className="space-y-3">
              <div className="mac-double-outline p-3">
                <div className="font-semibold">Summary</div>
                <div className="mt-1 whitespace-pre-wrap">{proposal.summary}</div>
              </div>
              <div className="mac-double-outline p-3">
                <div className="font-semibold">State Machine</div>
                <div className="mt-1">States: {proposal.stateMachine.states.join(', ') || '(none)'}</div>
                <div className="mt-2 space-y-1">
                  {proposal.stateMachine.transitions.slice(0, 40).map((t, idx) => (
                    <div key={`tr-${idx}`} className="font-mono">
                      {t.from} -&gt; {t.to}{t.guard ? ` | guard: ${t.guard}` : ''}{t.actor ? ` | actor: ${t.actor}` : ''}
                    </div>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="mac-double-outline p-3">
                  <div className="font-semibold">Flow Markdown</div>
                  <pre className="mt-1 whitespace-pre-wrap bg-white border p-2 rounded">{buildFlowLinesFromStateMachine(proposal).join('\n')}</pre>
                </div>
                <div className="mac-double-outline p-3">
                  <div className="font-semibold">Table Rows</div>
                  <div className="mt-1 space-y-1">
                    {proposal.table.rows.slice(0, 40).map((r, idx) => (
                      <div key={`row-${idx}`}>
                        <span className="font-medium">{r.role}</span> / {r.status} — {r.actions} — {r.fieldAccess}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {error ? <div className="mac-double-outline p-2 text-red-700">{error}</div> : null}
          {success ? <div className="mac-double-outline p-2 text-green-700">{success}</div> : null}
        </div>

        <div className="border-t px-4 py-3 flex items-center justify-between gap-2">
          <div className="text-[11px] opacity-70">Preview first. Apply blocks if file hash changed.</div>
          <div className="flex items-center gap-2">
            <button type="button" className="mac-btn" onClick={onClose} disabled={busy}>
              Close
            </button>
            <button
              type="button"
              className="mac-btn mac-btn--primary"
              disabled={!proposal || busy || hasBlockingValidationErrors}
              title={hasBlockingValidationErrors ? 'Cannot apply this proposal until validation errors are fixed. Re-run AI Structure Review.' : undefined}
              onClick={onApply}
            >
              {busy ? 'Applying…' : 'Apply Proposal'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
