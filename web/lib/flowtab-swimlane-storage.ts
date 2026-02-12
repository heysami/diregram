import * as Y from 'yjs';

export interface FlowTabSwimlaneData {
  fid: string;
  lanes: { id: string; label: string }[];
  stages: { id: string; label: string }[];
  placement: Record<string, { laneId: string; stage: number }>;
}

const blockType = (fid: string) => `flowtab-swimlane-${fid}`;

function findBlock(text: string, type: string): RegExpMatchArray | null {
  return text.match(new RegExp(`\`\`\`${type}\\n([\\s\\S]*?)\\n\`\`\``));
}

function tryParseJsonish(raw: string): { value: any; didRepair: boolean } | null {
  const trimmed = (raw || '').trim();
  if (!trimmed) return null;
  try {
    return { value: JSON.parse(trimmed), didRepair: false };
  } catch {
    // Try a few safe, common repairs:
    // - quote unquoted keys: { lanes: [...] } -> { "lanes": [...] }
    // - remove trailing commas: { "a": 1, } -> { "a": 1 }
    // - strip JS-style comments
    let s = trimmed;
    s = s.replace(/\/\*[\s\S]*?\*\//g, ''); // block comments
    s = s.replace(/(^|\s)\/\/.*$/gm, ''); // line comments
    s = s.replace(/,\s*([}\]])/g, '$1'); // trailing commas
    // Quote keys at start of line or after { or ,
    s = s.replace(/^(\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:/gm, '$1"$2":');
    s = s.replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:/g, '$1"$2":');
    try {
      return { value: JSON.parse(s), didRepair: s !== trimmed };
    } catch {
      return null;
    }
  }
}

function upsertBlock(text: string, type: string, json: unknown): string {
  const storageBlock = `\`\`\`${type}\n${JSON.stringify(json, null, 2)}\n\`\`\``;
  const re = new RegExp(`\`\`\`${type}\\n[\\s\\S]*?\\n\`\`\``);
  if (re.test(text)) return text.replace(re, storageBlock);
  const separatorIndex = text.indexOf('\n---\n');
  if (separatorIndex !== -1) {
    return text.slice(0, separatorIndex) + '\n' + storageBlock + '\n' + text.slice(separatorIndex);
  }
  return text + (text.endsWith('\n') ? '' : '\n') + '\n' + storageBlock;
}

export function loadFlowTabSwimlane(doc: Y.Doc, fid: string): FlowTabSwimlaneData | null {
  const yText = doc.getText('nexus');
  const text = yText.toString();
  const match = findBlock(text, blockType(fid));
  if (!match) return null;
  try {
    const parsedRes = tryParseJsonish(match[1]);
    if (!parsedRes) return null;
    const parsed = parsedRes.value;
    const data: FlowTabSwimlaneData = {
      fid,
      lanes: Array.isArray(parsed.lanes) ? parsed.lanes : [],
      stages: Array.isArray(parsed.stages) ? parsed.stages : [],
      placement: parsed.placement || {},
    };

    // Auto-heal: if we had to repair the JSON, rewrite it into canonical JSON so future loads are clean.
    if (parsedRes.didRepair) {
      Promise.resolve().then(() => {
        try {
          saveFlowTabSwimlane(doc, data);
        } catch {
          // ignore
        }
      });
    }

    return data;
  } catch (e) {
    console.error('Failed to parse flowtab swimlane data:', e);
    return null;
  }
}

export function saveFlowTabSwimlane(doc: Y.Doc, data: FlowTabSwimlaneData): void {
  const yText = doc.getText('nexus');
  const current = yText.toString();
  const next = upsertBlock(current, blockType(data.fid), data);
  if (next === current) return;
  doc.transact(() => {
    yText.delete(0, yText.length);
    yText.insert(0, next);
  });
}

export function buildDefaultFlowTabSwimlane(fid: string): FlowTabSwimlaneData {
  return {
    fid,
    lanes: [{ id: 'branch-1', label: 'Lane 1' }],
    stages: [{ id: 'stage-1', label: 'Stage 1' }],
    placement: {},
  };
}

