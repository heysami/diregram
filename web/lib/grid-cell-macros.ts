export type NxMacroName =
  | 'pills'
  | 'people'
  | 'progress'
  | 'check'
  | 'radio'
  | 'seg'
  | 'icon'
  | 'date'
  | 'c'
  | 'bg';

type ScanState = {
  inFence: boolean;
  fenceTickCount: number;
  inInlineCode: boolean;
  inlineTickCount: number;
};

export type ScannedMacro = {
  /** 0-based sequential macro index (only for recognized/convertible macros) */
  occ: number;
  start: number;
  end: number;
  raw: string;
  /**
   * Canonical inner form used by `parseInner`, e.g. `pills:tagA,tagB` or `check:1`.
   * This lets us support multiple surface syntaxes (like `<<tag>>`, `[x]`, `%%40`) while reusing the same renderer tags.
   */
  inner: string;
};

const KNOWN_NAMES = new Set<NxMacroName>([
  'pills',
  'people',
  'progress',
  'check',
  'radio',
  'seg',
  'icon',
  'date',
  'c',
  'bg',
]);

function escapeAttr(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function countRun(s: string, i: number, ch: string): number {
  let n = 0;
  while (i + n < s.length && s[i + n] === ch) n++;
  return n;
}

function scanStateInit(): ScanState {
  return { inFence: false, fenceTickCount: 0, inInlineCode: false, inlineTickCount: 0 };
}

function maybeToggleFence(input: string, i: number, st: ScanState): number | null {
  // Handle fenced code blocks using backticks. We treat any run >= 3 as a fence delimiter.
  const n = countRun(input, i, '`');
  if (n < 3) return null;
  if (!st.inInlineCode) {
    if (!st.inFence) {
      st.inFence = true;
      st.fenceTickCount = n;
    } else if (st.fenceTickCount === n) {
      st.inFence = false;
      st.fenceTickCount = 0;
    }
  }
  return n;
}

function maybeToggleInlineCode(input: string, i: number, st: ScanState): number | null {
  if (st.inFence) return null;
  const n = countRun(input, i, '`');
  if (n <= 0) return null;
  if (!st.inInlineCode) {
    st.inInlineCode = true;
    st.inlineTickCount = n;
  } else if (st.inlineTickCount === n) {
    st.inInlineCode = false;
    st.inlineTickCount = 0;
  }
  return n;
}

function parseInner(inner: string): { kind: 'open' | 'close' | 'self'; name: NxMacroName; body: string } | null {
  const trimmed = inner.trim();
  if (!trimmed) return null;

  // Close tags: [[/c]] [[/bg]]
  if (trimmed.startsWith('/')) {
    const name = trimmed.slice(1).trim() as NxMacroName;
    if (name === 'c' || name === 'bg') return { kind: 'close', name, body: '' };
    return null;
  }

  const colonIdx = trimmed.indexOf(':');
  if (colonIdx === -1) return null;
  const name = trimmed.slice(0, colonIdx).trim() as NxMacroName;
  if (!KNOWN_NAMES.has(name)) return null;
  const body = trimmed.slice(colonIdx + 1); // keep exact (may include ';')
  if (name === 'c' || name === 'bg') return { kind: 'open', name, body: body.trim() };
  return { kind: 'self', name, body: body.trim() };
}

function isDigit(ch: string | undefined): boolean {
  return !!ch && ch >= '0' && ch <= '9';
}

export function listRecognizedMacros(input: string): ScannedMacro[] {
  return Array.from(scanRecognizedMacros(input));
}

function* scanRecognizedMacros(input: string): Generator<ScannedMacro> {
  const st = scanStateInit();
  let occ = 0;

  for (let i = 0; i < input.length; ) {
    // Fence toggles
    const fenceN = maybeToggleFence(input, i, st);
    if (fenceN) {
      i += fenceN;
      continue;
    }
    // Inline code toggles
    const inlineN = maybeToggleInlineCode(input, i, st);
    if (inlineN) {
      i += inlineN;
      continue;
    }

    if (st.inFence || st.inInlineCode) {
      i += 1;
      continue;
    }

    // New compact syntaxes (kept short; still safe because we only act outside code spans).
    // Pills: <<tag>> or <<tagA,tagB>>
    if (input[i] === '<' && input[i + 1] === '<') {
      const close = input.indexOf('>>', i + 2);
      if (close !== -1) {
        const raw = input.slice(i, close + 2);
        const body = input.slice(i + 2, close).trim();
        yield { occ: occ++, start: i, end: close + 2, raw, inner: `pills:${body}` };
        i = close + 2;
        continue;
      }
    }

    // People: :)John Doe:) or :)John,Laura:)
    if (input[i] === ':' && input[i + 1] === ')') {
      const close = input.indexOf(':)', i + 2);
      if (close !== -1) {
        const raw = input.slice(i, close + 2);
        const body = input.slice(i + 2, close).trim();
        yield { occ: occ++, start: i, end: close + 2, raw, inner: `people:${body}` };
        i = close + 2;
        continue;
      }
    }

    // Checkbox: [] [ ] [x] [X]
    if (input[i] === '[') {
      const ch = input[i + 1];
      const ch2 = input[i + 2];
      if (ch === ']' ) {
        yield { occ: occ++, start: i, end: i + 2, raw: '[]', inner: 'check:0' };
        i += 2;
        continue;
      }
      if (ch === ' ' && ch2 === ']') {
        yield { occ: occ++, start: i, end: i + 3, raw: '[ ]', inner: 'check:0' };
        i += 3;
        continue;
      }
      if ((ch === 'x' || ch === 'X') && ch2 === ']') {
        yield { occ: occ++, start: i, end: i + 3, raw: `[${ch}]`, inner: 'check:1' };
        i += 3;
        continue;
      }
    }

    // Radio token: () ( ) (o) (O)
    if (input[i] === '(') {
      const ch = input[i + 1];
      const ch2 = input[i + 2];
      if (ch === ')' ) {
        yield { occ: occ++, start: i, end: i + 2, raw: '()', inner: 'radio:0' };
        i += 2;
        continue;
      }
      if (ch === ' ' && ch2 === ')') {
        yield { occ: occ++, start: i, end: i + 3, raw: '( )', inner: 'radio:0' };
        i += 3;
        continue;
      }
      if ((ch === 'o' || ch === 'O') && ch2 === ')') {
        yield { occ: occ++, start: i, end: i + 3, raw: `(o)`, inner: 'radio:1' };
        i += 3;
        continue;
      }
    }

    // Progress: %%40 (0..100) and draggable compact variant: %%40!
    if (input[i] === '%' && input[i + 1] === '%') {
      let j = i + 2;
      let num = '';
      while (isDigit(input[j]) && num.length < 3) {
        num += input[j]!;
        j++;
      }
      if (num.length) {
        let drag = false;
        if (input[j] === '!') {
          drag = true;
          j += 1;
        }
        const raw = input.slice(i, j);
        yield { occ: occ++, start: i, end: j, raw, inner: `progress:${num}${drag ? ';drag' : ''}` };
        i = j;
        continue;
      }
    }

    // Date: @@YYYY-MM-DD or @@YYYY-MM-DD..YYYY-MM-DD
    if (input[i] === '@' && input[i + 1] === '@') {
      let j = i + 2;
      while (j < input.length && /[0-9.\-]/.test(input[j] || '') && j - (i + 2) < 32) j++;
      const body = input.slice(i + 2, j).trim();
      const raw = input.slice(i, j);
      // Yield even when body is empty so typing `@@` instantly becomes a date widget.
      yield { occ: occ++, start: i, end: j, raw, inner: `date:${body}` };
      i = j;
      continue;
    }

    // Segmented (button group): {{low|*med|high}} with optional icons by using emoji in labels.
    if (input[i] === '{' && input[i + 1] === '{') {
      const close = input.indexOf('}}', i + 2);
      if (close !== -1) {
        const raw = input.slice(i, close + 2);
        const innerRaw = input.slice(i + 2, close).trim();
        if (innerRaw) {
          const opts = innerRaw.split('|').map((s) => s.trim()).filter(Boolean);
          const cleaned = opts.map((o) => (o.startsWith('*') ? o.slice(1) : o));
          const selected = opts.find((o) => o.startsWith('*'))?.slice(1) || cleaned[0] || '';
          const body = `opts=${cleaned.join('|')};value=${selected}`;
          yield { occ: occ++, start: i, end: close + 2, raw, inner: `seg:${body}` };
        }
        i = close + 2;
        continue;
      }
    }

    // Semantic color: ^r{...} (text) and ^R{...} (background)
    if (input[i] === '^' && input[i + 2] === '{') {
      const code = input[i + 1];
      if (code && /[rgbyRGBY]/.test(code)) {
        const close = input.indexOf('}', i + 3);
        if (close !== -1) {
          const raw = input.slice(i, close + 1);
          const body = input.slice(i + 3, close);
          const kind = code.toLowerCase();
          const isBg = code === code.toUpperCase();
          const open = isBg ? `bg:${kind}` : `c:${kind}`;
          // We emit as wrapper: open + content + close.
          yield { occ: occ++, start: i, end: close + 1, raw, inner: `${open}]${body}` };
          // Note: wrapper handled in macrosToHtml below via special-case.
          i = close + 1;
          continue;
        }
      }
    }

    // Even simpler semantic color: r{...} (text) and R{...} (background)
    if (/[rgbyRGBY]/.test(input[i] || '') && input[i + 1] === '{') {
      const code = input[i]!;
      const close = input.indexOf('}', i + 2);
      if (close !== -1) {
        const raw = input.slice(i, close + 1);
        const body = input.slice(i + 2, close);
        const kind = code.toLowerCase();
        const isBg = code === code.toUpperCase();
        const open = isBg ? `bg:${kind}` : `c:${kind}`;
        yield { occ: occ++, start: i, end: close + 1, raw, inner: `${open}]${body}` };
        i = close + 1;
        continue;
      }
    }

    // Ultra-compact semantic color: r:word (text) and R:word (background)
    // Also supports r:(multiple words) and r:"multiple words"
    if (/[rgbyRGBY]/.test(input[i] || '') && input[i + 1] === ':') {
      const code = input[i]!;
      const kind = code.toLowerCase();
      const isBg = code === code.toUpperCase();
      const open = isBg ? `bg:${kind}` : `c:${kind}`;
      let j = i + 2;
      while (j < input.length && /\s/.test(input[j] || '') && j - (i + 2) < 4) j++;
      if (input[j] === '(') {
        const close = input.indexOf(')', j + 1);
        if (close !== -1) {
          const raw = input.slice(i, close + 1);
          const body = input.slice(j + 1, close);
          yield { occ: occ++, start: i, end: close + 1, raw, inner: `${open}]${body}` };
          i = close + 1;
          continue;
        }
      } else if (input[j] === '"') {
        const close = input.indexOf('"', j + 1);
        if (close !== -1) {
          const raw = input.slice(i, close + 1);
          const body = input.slice(j + 1, close);
          yield { occ: occ++, start: i, end: close + 1, raw, inner: `${open}]${body}` };
          i = close + 1;
          continue;
        }
      } else {
        const startWord = j;
        while (j < input.length && !/\s/.test(input[j] || '') && j - startWord < 80) j++;
        const body = input.slice(startWord, j);
        if (body.length) {
          const raw = input.slice(i, j);
          yield { occ: occ++, start: i, end: j, raw, inner: `${open}]${body}` };
          i = j;
          continue;
        }
      }
    }

    if (input[i] === '[' && input[i + 1] === '[') {
      const close = input.indexOf(']]', i + 2);
      if (close === -1) {
        i += 2;
        continue;
      }
      const raw = input.slice(i, close + 2);
      const inner = input.slice(i + 2, close).trim();
      const parsed = parseInner(inner);
      if (parsed) {
        yield { occ: occ++, start: i, end: close + 2, raw, inner };
      }
      i = close + 2;
      continue;
    }

    i += 1;
  }
}

export function macrosToHtml(input: string): string {
  if (!input) return '';
  const parts: string[] = [];
  let last = 0;

  for (const m of scanRecognizedMacros(input)) {
    parts.push(input.slice(last, m.start));
    // Special-case compact semantic color ^r{...} and ^R{...} which are encoded as `c:x]content` / `bg:x]content`.
    const bracket = m.inner.indexOf(']');
    if (bracket !== -1 && (m.inner.startsWith('c:') || m.inner.startsWith('bg:'))) {
      const open = m.inner.slice(0, bracket); // c:r or bg:y
      const content = m.inner.slice(bracket + 1);
      const kind = open.split(':')[1] || '';
      const mode = open.startsWith('bg:') ? 'bg' : 'text';
      parts.push(`<nx-color occ="${m.occ}" mode="${mode}" kind="${escapeAttr(kind)}">`);
      parts.push(content);
      parts.push(`</nx-color>`);
      last = m.end;
      continue;
    }

    const parsed = parseInner(m.inner);
    if (!parsed) {
      parts.push(m.raw);
      last = m.end;
      continue;
    }

    if (parsed.kind === 'close') {
      // Only wrapper macros close.
      parts.push(parsed.name === 'c' ? '</nx-color>' : '</nx-color>');
      last = m.end;
      continue;
    }

    if (parsed.kind === 'open') {
      const mode = parsed.name === 'bg' ? 'bg' : 'text';
      parts.push(`<nx-color occ="${m.occ}" mode="${mode}" kind="${escapeAttr(parsed.body)}">`);
      last = m.end;
      continue;
    }

    // self
    parts.push(
      `<nx-${parsed.name} occ="${m.occ}" body="${escapeAttr(parsed.body)}" raw="${escapeAttr(m.raw)}"></nx-${parsed.name}>`,
    );
    last = m.end;
  }

  parts.push(input.slice(last));
  return parts.join('');
}

export function replaceMacroOccurrence(input: string, occ: number, nextRaw: string): string {
  if (!input) return input;
  if (!Number.isFinite(occ) || occ < 0) return input;
  let idx = 0;
  for (const m of scanRecognizedMacros(input)) {
    if (idx === occ) {
      return input.slice(0, m.start) + nextRaw + input.slice(m.end);
    }
    idx++;
  }
  return input;
}

/**
 * Radio groups: treat all radio tokens on the same line as one group.
 * Clicking one sets it to filled `(o)` and all other tokens in that line to empty `( )`.
 */
export function toggleRadioInLine(input: string, occ: number): string {
  if (!input) return input;
  // Find the target occurrence and its line.
  let target: ScannedMacro | null = null;
  for (const m of scanRecognizedMacros(input)) {
    const parsed = parseInner(m.inner);
    if (parsed?.name !== 'radio') continue;
    if (m.occ === occ) {
      target = m;
      break;
    }
  }
  if (!target) return input;
  const lineStart = input.lastIndexOf('\n', target.start - 1) + 1;
  const lineEndRaw = input.indexOf('\n', target.end);
  const lineEnd = lineEndRaw === -1 ? input.length : lineEndRaw;
  const line = input.slice(lineStart, lineEnd);

  // Re-scan within the line to find all radio tokens, then rebuild.
  const tokens: Array<{ start: number; end: number; raw: string }> = [];
  for (let i = 0; i < line.length; ) {
    if (line[i] === '(') {
      const ch = line[i + 1];
      const ch2 = line[i + 2];
      if (ch === ')' ) { tokens.push({ start: i, end: i + 2, raw: '()' }); i += 2; continue; }
      if (ch === ' ' && ch2 === ')') { tokens.push({ start: i, end: i + 3, raw: '( )' }); i += 3; continue; }
      if ((ch === 'o' || ch === 'O') && ch2 === ')') { tokens.push({ start: i, end: i + 3, raw: '(o)' }); i += 3; continue; }
    }
    i++;
  }
  if (tokens.length <= 1) {
    // Just toggle this one.
    const cur = input.slice(target.start, target.end);
    const next = cur.includes('o') ? '( )' : '(o)';
    return input.slice(0, target.start) + next + input.slice(target.end);
  }

  // Determine which token index was clicked (by position).
  const clickedInLine = target.start - lineStart;
  let clickedIdx = 0;
  for (let i = 0; i < tokens.length; i++) {
    if (clickedInLine >= tokens[i]!.start && clickedInLine < tokens[i]!.end) {
      clickedIdx = i;
      break;
    }
  }

  const out: string[] = [];
  let lastPos = 0;
  tokens.forEach((t, i) => {
    out.push(line.slice(lastPos, t.start));
    out.push(i === clickedIdx ? '(o)' : '( )');
    lastPos = t.end;
  });
  out.push(line.slice(lastPos));
  const nextLine = out.join('');
  return input.slice(0, lineStart) + nextLine + input.slice(lineEnd);
}

