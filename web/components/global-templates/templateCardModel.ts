import type { NexusTemplateHeader } from '@/lib/nexus-template';
import { readTemplateHeader, renderTemplatePayload } from '@/lib/nexus-template';
import { buildTemplateVarDefaults, computeEffectiveTemplateVars } from '@/lib/template-vars';

export type GlobalTemplateCardModel = {
  id: string;
  name: string;
  ownerId: string;
  ownerLabel: string;
  typeKey: string;
  typeLabel: string;
  header: NexusTemplateHeader | null;
  rendered: string;
};

export function computeTypeKey(header: NexusTemplateHeader | null): string {
  if (!header) return 'unknown';
  if (header.mode === 'appendFragment') return `${header.targetKind}:${String(header.fragmentKind || 'fragment')}`;
  return String(header.targetKind || 'unknown');
}

export function computeTypeLabel(header: NexusTemplateHeader | null): string {
  if (!header) return 'Unknown';
  const base = String(header.targetKind || 'Unknown');
  if (header.mode === 'appendFragment') return `${base} · ${String(header.fragmentKind || 'fragment')}`;
  return base;
}

export function computeRendered(markdown: string): { header: NexusTemplateHeader | null; rendered: string } {
  const { header, rest } = readTemplateHeader(markdown || '');
  if (!header) return { header: null, rendered: String(rest || '') };
  const payload = String(rest || '');
  const effectiveVars = computeEffectiveTemplateVars(header, payload);
  const varValues = buildTemplateVarDefaults(effectiveVars);
  const rendered = renderTemplatePayload(payload, varValues);
  return { header, rendered };
}

