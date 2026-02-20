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
    'Stage 1 — Prepare inputs (guides + resources)',
    '- Download the AI guideline + checklist bundle(s).',
    '- Put them in your Cursor project folder along with your source resources.',
    '- Convert resources to markdown (e.g. via Docling) so the AI can cite them cleanly.',
    '',
    'Stage 2 — Generate + Vision assets + verification',
    '- In Cursor (Agent mode), ask it to create the NexusMap project you want, explicitly linking to the markdown resources and following the guideline format.',
    '- If there is a design system or you have an online system, generate Vision assets as part of the generation workflow.',
    '- After generation, run the verification sequence: verify Data Objects, then re-check IA + Expanded, then Swimlanes, then System Flow.',
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
    'Stage 5 — MCP + build the app',
    '- Create/use an MCP server to expose the RAG tools (see mcp-server-nexusmap-rag-hosted/ and mcp-server-nexusmap-rag/). BYOK: provide your own AI API key in the client (e.g. Cursor) as header x-openai-api-key.',
    '- Back in Cursor, ask it to build the app using the RAG you set up through MCP.',
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
        title: 'Stage 1 — Prepare inputs (guides + resources)',
        steps: [
          { icon: Download, title: 'Download the AI guideline + checklist', detail: <>Download the AI guideline and checklist bundle(s).</> },
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
                Convert your resources to markdown (e.g. via Docling) so the AI can reference consistent text. In NexusMap, this is typically done via the workspace{' '}
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
            title: 'Generate the NexusMap project (Cursor Agent mode)',
            detail: (
              <>
                Ask Cursor in Agent mode to create the project that you want, linking to the resources that are already markdown, and following the format of the guideline.
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
                After generation, run through the list of sequence. After running through <span className="font-semibold">Data Objects</span> and though you verify again the{' '}
                <span className="font-semibold">IA + Expanded</span>. Then continue to <span className="font-semibold">Swimlane</span> and lastly the{' '}
                <span className="font-semibold">System Flow</span>.
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
        title: 'Stage 5 — MCP + build the app',
        steps: [
          {
            icon: FileText,
            title: 'MCP setup (sample code + BYOK)',
            detail: (
              <>
                Once ready make a mcp (guide on sample code for mcp) for cursor with the url and ai api key. We have BYOK policy. Sample code lives in{' '}
                <code className="font-mono">mcp-server-nexusmap-rag-hosted/</code> and <code className="font-mono">mcp-server-nexusmap-rag/</code>. In Cursor, the key is
                typically passed as header <code className="font-mono">x-openai-api-key</code>.
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

        <div className="p-4 flex-1 min-h-0 overflow-auto text-[12px] space-y-4">
          <div className="text-[11px] text-slate-600">
            This is the recommended end-to-end sequence for generating, validating, importing, exporting, and turning a NexusMap project into a queryable RAG knowledge base.
          </div>

          <div className="flex flex-wrap gap-2">
            <button type="button" className="mac-btn h-8 flex items-center gap-2" onClick={() => void downloadDiagram()} title="Downloads a single .md bundle">
              <Download size={14} />
              Download diagram guides bundle
            </button>
            <button type="button" className="mac-btn h-8 flex items-center gap-2" onClick={() => void downloadVision()} title="Downloads a single .md bundle">
              <Download size={14} />
              Download Vision guides bundle
            </button>
            <button type="button" className="mac-btn h-8 flex items-center gap-2" onClick={() => void copy()} title="Copy the sequence for Cursor/AI">
              <Clipboard size={14} />
              Copy steps
            </button>
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
            Tip: most of the “project-level” actions you’ll need are already under <span className="font-semibold">Project → …</span> in the workspace header (download
            bundles, export semantic KG, build RAG KB, copy MCP URL).
          </div>

          {copyStatus ? <div className="text-[11px] text-slate-600">{copyStatus}</div> : null}
        </div>
      </div>
    </div>
  );
}

