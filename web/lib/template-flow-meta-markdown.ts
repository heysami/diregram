import type { NexusTemplateHeader } from '@/lib/nexus-template';

export function renderTemplateFlowMetaMarkdown(flowMeta: NexusTemplateHeader['flowMeta'] | undefined): string {
  if (!flowMeta || flowMeta.version !== 1) return '';
  const blocks: string[] = [];

  if (flowMeta.flowNodes && typeof flowMeta.flowNodes === 'object') {
    blocks.push(['```flow-nodes', JSON.stringify(flowMeta.flowNodes, null, 2), '```', ''].join('\n'));
  }

  const types = flowMeta.processNodeTypes || {};
  for (const [rn, t] of Object.entries(types)) {
    const k = String(rn || '').trim();
    if (!/^\d+$/.test(k)) continue;
    if (!t) continue;
    // Note: nodeId is not stable across inserts; running number is the true anchor.
    blocks.push(['```process-node-type-' + k, JSON.stringify({ type: t, nodeId: '' }), '```', ''].join('\n'));
  }

  const byOff = flowMeta.connectorLabelsByOffset || {};
  if (byOff && typeof byOff === 'object' && Object.keys(byOff).length) {
    const out: Record<string, { label: string; color: string }> = {};
    for (const [k, v] of Object.entries(byOff as any)) {
      const key = String(k || '').trim();
      if (!/^\d+__\d+$/.test(key)) continue;
      const [fromOffStr, toOffStr] = key.split('__');
      const fromId = `node-${Number(fromOffStr)}`;
      const toId = `node-${Number(toOffStr)}`;
      if (!v || typeof v !== 'object') continue;
      const vv = v as any;
      const label = typeof vv.label === 'string' ? vv.label : '';
      const color = typeof vv.color === 'string' ? vv.color : '#000000';
      if (!label.trim()) continue;
      out[`${fromId}__${toId}`] = { label, color };
    }
    if (Object.keys(out).length) {
      blocks.push(['```flow-connector-labels', JSON.stringify(out, null, 2), '```', ''].join('\n'));
    }
  }

  return blocks.join('\n');
}

