'use client';

import type { SupabaseClient } from '@supabase/supabase-js';
import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import type { Editor, TLEditorSnapshot } from 'tldraw';
import { useHtmlThemeOverride } from '@/hooks/use-html-theme-override';
import type { VisionDoc } from '@/lib/visionjson';
import { VisionCanvas } from '@/components/vision/v2/VisionCanvas';
import { MarkdownPopup } from '@/components/vision/v2/shell/MarkdownPopup';
import { TldrawHeaderActions } from '@/components/vision/v2/shell/TldrawHeaderActions';
import { useCardCount } from '@/components/vision/v2/hooks/useCardCount';

export function VisionEditor({
  fileId,
  title,
  statusLabel,
  doc,
  onChange,
  onBack,
  rawMarkdownPreview,
  rawMarkdownChars,
  supabaseMode,
  userId,
}: {
  fileId: string;
  folderId: string | null;
  title?: string;
  statusLabel?: string;
  doc: VisionDoc;
  onChange: (next: VisionDoc) => void;
  onBack?: () => void;
  rawMarkdownPreview?: string;
  rawMarkdownChars?: number;
  supabaseMode: boolean;
  supabase: SupabaseClient | null;
  userId: string | null;
}) {
  useHtmlThemeOverride('vision');

  const [canvasEditor, setCanvasEditor] = useState<Editor | null>(null);
  const [markdownOpen, setMarkdownOpen] = useState(false);
  useCardCount(doc); // keep memoized for future use (e.g. status line); doesn't render now.

  return (
    <main className="h-screen w-screen bg-white text-black">
      <div className="h-12 px-3 border-b flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            className="h-8 px-2 border flex items-center gap-2 bg-white"
            onClick={onBack}
            title="Back to workspace"
          >
            <ArrowLeft size={16} />
            <span className="text-sm">Workspace</span>
          </button>
          <TldrawHeaderActions editor={canvasEditor} />
          <div className="font-semibold truncate">{title || 'Vision'}</div>
          <div className="text-xs opacity-70 whitespace-nowrap">{statusLabel || ''}</div>
        </div>

        <div className="flex items-center gap-2">
          <button type="button" className="h-8 px-2 border bg-white text-sm" onClick={() => setMarkdownOpen(true)} title="Open markdown preview">
            Markdown
          </button>
        </div>
      </div>

      <div className="absolute inset-0 top-12">
        <div className="h-full w-full overflow-hidden">
          <VisionCanvas
            fileId={fileId}
            sessionStorageKey={`vision:tldraw:canvas:session:${fileId}`}
            initialSnapshot={((doc as any).tldraw as Partial<TLEditorSnapshot>) || null}
            onChangeSnapshot={(snapshot) => {
              onChange({ version: 2, tldraw: snapshot, updatedAt: new Date().toISOString() } as any);
            }}
            onReadyEditor={(ed) => setCanvasEditor(ed)}
          />
        </div>
      </div>

      <MarkdownPopup
        isOpen={markdownOpen}
        onClose={() => setMarkdownOpen(false)}
        rawMarkdownPreview={rawMarkdownPreview}
        rawMarkdownChars={rawMarkdownChars}
        supabaseMode={supabaseMode}
        userId={userId}
      />
    </main>
  );
}

