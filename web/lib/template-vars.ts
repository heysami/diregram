import { extractTemplateVarNames, mergeTemplateVars, type NexusTemplateHeader, type NexusTemplateVarV1 } from '@/lib/nexus-template';

export function computeEffectiveTemplateVars(header: NexusTemplateHeader | null | undefined, payload: string): NexusTemplateVarV1[] {
  if (!header) return [];
  return mergeTemplateVars(header.vars || [], extractTemplateVarNames(String(payload || '')));
}

export function buildTemplateVarDefaults(vars: NexusTemplateVarV1[]): Record<string, string> {
  const out: Record<string, string> = {};
  (vars || []).forEach((v) => {
    const name = String(v?.name || '').trim();
    if (!name) return;
    out[name] = typeof v.default === 'string' ? v.default : '';
  });
  return out;
}

export function computeTemplateVarsAndDefaults(
  header: NexusTemplateHeader | null | undefined,
  payload: string,
): { vars: NexusTemplateVarV1[]; defaults: Record<string, string> } {
  const vars = computeEffectiveTemplateVars(header, payload);
  const defaults = buildTemplateVarDefaults(vars);
  return { vars, defaults };
}

