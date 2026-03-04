'use client';

import { useMemo, useState } from 'react';
import {
  AppWindow,
  Clipboard,
  Database,
  Download,
  FileText,
  Folder,
  Import,
  ListChecks,
  NotebookPen,
  Pencil,
  Sparkles,
  Waypoints,
  X,
  type LucideIcon,
} from 'lucide-react';

function buildPlainTextSteps() {
  return [
    'Help on AI usage — recommended sequence',
    '',
    'Stage 1 — Prepare inputs (strict skills + resources)',
    '- Download strict-plan agent skills: (1) Generation + Checklist and (2) MCP RAG Operator.',
    '- Keep diagram/vision markdown guide bundles available for guided generation and checks.',
    '- Put them in your Cursor project folder along with your source resources.',
    '- Convert resources to markdown (e.g. via Docling) so the AI can cite them cleanly.',
    '',
    'Stage 2 — Generate + Vision assets + verification',
    '- In Cursor/Codex/Claude, run the generation skill and follow its strict step order.',
    '- If there is a design system or you have an online system, generate Vision assets as part of the generation workflow.',
    '- After generation, run the verification sequence: verify Data Relationship, then re-check IA + Expanded, then Swimlanes, then Tech Flow.',
    '',
    'Stage 3 — Import + tweak + notes + review Semantic KG',
    '- Once they are ok, import to Diagram, import to Vision, and if your resources have Excel convert to CSV and upload to the Grid.',
    '- After import, edit and tweak directly under Diagram as needed.',
    '- Add note if you need more info.',
    '- Export the Semantic KG and review it for coverage + consistency.',
    '',
    'Stage 4 — Build KG for RAG',
    '- Build the Knowledge Base for RAG (embeddings + semantic KG).',
    '',
    'Stage 5 — MCP + build the app (Account-managed MCP generation)',
    '- Open Account MCP setup (/account#mcp-ssh-setup) to generate MCP config. MCP generation stays under Account.',
    '- Use the MCP RAG Operator skill so tools are called in the correct order with project/key checks.',
    '- Back in client, ask it to build the app using the RAG you set up through MCP.',
    '',
  ].join('\n');
}

type MiniStep = { icon: LucideIcon; title: string; detail: React.ReactNode };
type Stage = { icon: LucideIcon; title: string; steps: MiniStep[] };

export function AiUsageHelpModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [copyStatus, setCopyStatus] = useState<string | null>(null);

  const stages = useMemo<Stage[]>(
    () => [
      {
        icon: Folder,
        title: 'Stage 1 — Prepare inputs (strict skills + resources)',
        steps: [
          {
            icon: Download,
            title: 'Download strict-plan agent skills',
            detail: <>Download both strict-plan skills: Generation + Checklist and MCP RAG Operator.</>,
          },
          {
            icon: FileText,
            title: 'Keep markdown guide bundles available',
            detail: <>Diagram and Vision markdown guide bundles are still useful for guided generation and verification.</>,
          },
          {
            icon: Folder,
            title: 'Put everything in one project folder',
            detail: <>Put the bundle(s) in a folder with your Cursor project on it, and put the resources there too.</>,
          },
          {
            icon: FileText,
            title: 'Convert resources to markdown',
            detail: (
              <>
                Convert your resources to markdown (e.g. via Docling) so the AI can reference consistent text. In Diregram, this is typically done via the workspace{' '}
                <span className="font-semibold">Import</span> tab.
              </>
            ),
          },
        ],
      },
      {
        icon: Sparkles,
        title: 'Stage 2 — Generate + Vision assets + verification',
        steps: [
          {
            icon: Sparkles,
            title: 'Generate the Diregram project (Cursor Agent mode)',
            detail: (
              <>
                Run the strict generation skill in your client and follow the non-skippable sequence while linking the markdown resources.
              </>
            ),
          },
          {
            icon: Waypoints,
            title: 'Generate Vision assets (design system / online system)',
            detail: <>If there is design system or have online system can run through the Vision assets too.</>,
          },
          {
            icon: ListChecks,
            title: 'Verification sequence (post-generation)',
            detail: (
              <>
                After generation, run through the list of sequence. After running through <span className="font-semibold">Data Relationship</span> and though you verify again the{' '}
                <span className="font-semibold">IA + Expanded</span>. Then continue to <span className="font-semibold">Swimlane</span> and lastly the{' '}
                <span className="font-semibold">Tech Flow</span>.
              </>
            ),
          },
        ],
      },
      {
        icon: Import,
        title: 'Stage 3 — Import + tweak + notes + review Semantic KG',
        steps: [
          {
            icon: Import,
            title: 'Import artifacts (Diagram/Vision/Grid)',
            detail: <>Once they are ok, you import to Diagram, import to Vision and if your resources has excel, convert to csv and upload to the grid.</>,
          },
          {
            icon: Pencil,
            title: 'Edit + tweak directly under Diagram',
            detail: <>After import, you can edit and add tweaks directly under Diagram as needed.</>,
          },
          {
            icon: NotebookPen,
            title: 'Add notes (after import)',
            detail: <>Add note if you need more info.</>,
          },
          {
            icon: FileText,
            title: 'Verify/review Semantic KG',
            detail: <>Then export to semantic kg to review.</>,
          },
        ],
      },
      {
        icon: Database,
        title: 'Stage 4 — Build KG for RAG',
        steps: [
          {
            icon: Database,
            title: 'Build KG for RAG',
            detail: <>Then Build KG for RAG.</>,
          },
        ],
      },
      {
        icon: AppWindow,
        title: 'Stage 5 — MCP + build the app (Account-managed MCP generation)',
        steps: [
          {
            icon: FileText,
            title: 'Generate MCP from Account setup',
            detail: (
              <>
                Open <code className="font-mono">/account#mcp-ssh-setup</code> to generate MCP config. MCP generation stays under Account.
              </>
            ),
          },
          {
            icon: FileText,
            title: 'Use MCP operator skill (strict tool order)',
            detail: (
              <>
                Use the MCP RAG Operator skill so project selection and key checks are done before querying.
              </>
            ),
          },
          {
            icon: AppWindow,
            title: 'Build the app through MCP',
            detail: <>Once is done go to cursor and ask to build the app with the rag we just setup through the mcp.</>,
          },
        ],
      },
    ],
    [],
  );

  const copy = async () => {
    const text = buildPlainTextSteps();
    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus('Copied steps to clipboard.');
      setTimeout(() => setCopyStatus(null), 1200);
    } catch {
      setCopyStatus('Copy failed (clipboard permission).');
      setTimeout(() => setCopyStatus(null), 1500);
    }
  };

  const downloadDiagram = async () => {
    const mod = await import('@/lib/ai-guides/download-guides-and-checklists');
    mod.downloadDiagramGuidesAndChecklistsBundle();
  };

  const downloadVision = async () => {
    const mod = await import('@/lib/ai-guides/download-guides-and-checklists');
    mod.downloadVisionGuidesAndChecklistsBundle();
  };

  const downloadGenerationSkill = async () => {
    const mod = await import('@/lib/ai-guides/download-agent-skills');
    mod.downloadGenerationChecklistAgentSkillBundle();
  };

  const downloadMcpSkill = async () => {
    const mod = await import('@/lib/ai-guides/download-agent-skills');
    mod.downloadMcpRagOperatorAgentSkillBundle();
  };

  const openAccountMcpSetup = () => {
    if (typeof window === 'undefined') return;
    window.location.assign('/account#mcp-ssh-setup');
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[5000] flex items-center justify-center bg-black/20"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Help on AI usage"
    >
      <div
        className="mac-window mac-double-outline w-[min(980px,96vw)] max-h-[86vh] overflow-hidden bg-white flex flex-col"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mac-titlebar">
          <div className="mac-title">Help on AI usage</div>
          <div className="flex-1" />
          <button type="button" className="mac-btn h-7" onClick={onClose} title="Close">
            <X size={14} />
          </button>
        </div>

        <div className="shrink-0 border-b border-slate-200 bg-slate-50 px-4 py-3 space-y-2">
          <div className="text-[11px] text-slate-700 font-semibold">Quick actions</div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="mac-btn h-8 flex items-center gap-2"
              onClick={() => void downloadGenerationSkill()}
              title="Download strict-plan agent skill ZIP"
            >
              <Download size={14} />
              Download skill: Generation + checklist
            </button>
            <button
              type="button"
              className="mac-btn h-8 flex items-center gap-2"
              onClick={() => void downloadMcpSkill()}
              title="Download strict-plan agent skill ZIP"
            >
              <Download size={14} />
              Download skill: MCP RAG operator
            </button>
            <button type="button" className="mac-btn h-8 flex items-center gap-2" onClick={openAccountMcpSetup} title="Open Account MCP setup">
              <AppWindow size={14} />
              Open Account MCP setup
            </button>
            <button type="button" className="mac-btn h-8 flex items-center gap-2" onClick={() => void downloadDiagram()} title="Download .md guides bundle">
              <Download size={14} />
              Download diagram guides + checklists (.md)
            </button>
            <button type="button" className="mac-btn h-8 flex items-center gap-2" onClick={() => void downloadVision()} title="Download .md guides bundle">
              <Download size={14} />
              Download Vision guides + checklists (.md)
            </button>
            <button type="button" className="mac-btn h-8 flex items-center gap-2" onClick={() => void copy()} title="Copy the sequence for Cursor/AI">
              <Clipboard size={14} />
              Copy steps
            </button>
          </div>
          {copyStatus ? <div className="text-[11px] text-slate-600">{copyStatus}</div> : null}
        </div>

        <div className="p-4 flex-1 min-h-0 overflow-auto text-[12px] space-y-4">
          <div className="text-[11px] text-slate-600">
            This is the recommended end-to-end sequence for generating, validating, importing, exporting, and turning a Diregram project into a queryable RAG knowledge base.
          </div>

          <div className="space-y-3">
            {stages.map((stage, idx) => {
              const StageIcon = stage.icon;
              return (
                <div key={idx} className="border border-slate-200 rounded-lg bg-white overflow-hidden">
                  <div className="px-3 py-2 border-b bg-slate-50 flex items-center gap-2">
                    <StageIcon size={16} className="text-slate-700" />
                    <div className="font-semibold text-slate-900">{stage.title}</div>
                  </div>
                  <div className="p-3 space-y-2">
                    {stage.steps.map((s, j) => {
                      const StepIcon = s.icon;
                      return (
                        <div key={j} className="flex items-start gap-2">
                          <div className="mt-0.5 shrink-0 rounded border border-slate-200 bg-slate-50 p-1">
                            <StepIcon size={14} className="text-slate-700" />
                          </div>
                          <div className="min-w-0">
                            <div className="font-semibold text-slate-900">{s.title}</div>
                            <div className="text-slate-700">{s.detail}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-[11px] text-slate-700">
            Tip: use <span className="font-semibold">+ New</span> for creation and AI generation, <span className="font-semibold">RAG</span> for build/export actions,
            and this modal’s <span className="font-semibold">Quick actions</span> for skill/guide downloads and copy helpers.
          </div>
        </div>
      </div>
    </div>
  );
}
