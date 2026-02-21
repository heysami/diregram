import type { MermaidDiagramType } from './types';
import { stripCodeFencesAndFrontmatter } from './text';

export function detectMermaidDiagramType(src: string): MermaidDiagramType | 'unknown' {
  const lines = stripCodeFencesAndFrontmatter(src).split('\n');
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('%%') || line.startsWith('%%{')) continue;
    const h = line.toLowerCase();

    if (h.startsWith('flowchart') || h.startsWith('graph')) return 'flowchart';
    if (h.startsWith('sequencediagram')) return 'sequence';
    if (h.startsWith('classdiagram')) return 'class';
    if (h.startsWith('statediagram')) return 'state';
    if (h.startsWith('erdiagram')) return 'er';
    if (h.startsWith('journey')) return 'journey';
    if (h.startsWith('mindmap')) return 'mindmap';

    if (line.startsWith('C4') || line.startsWith('c4')) return 'c4';

    if (h.startsWith('block-beta') || h === 'block') return 'block';
    if (h.startsWith('packet-beta') || h === 'packet') return 'packet';
    if (h.startsWith('architecture-beta') || h === 'architecture') return 'architecture';
  }
  return 'unknown';
}

