import {
  buildVisionDesignSystemReadout,
  removeFencedBlocks,
  upsertFencedBlock,
  type VisionDesignSystemV1,
} from '@/lib/vision-design-system';

const BAKED_STYLE_PROPS = [
  'display',
  'position',
  'top',
  'right',
  'bottom',
  'left',
  'z-index',
  'box-sizing',
  'width',
  'height',
  'min-width',
  'min-height',
  'max-width',
  'max-height',
  'margin',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'padding',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'gap',
  'row-gap',
  'column-gap',
  'grid-template-columns',
  'grid-template-rows',
  'grid-auto-flow',
  'align-items',
  'justify-items',
  'align-content',
  'justify-content',
  'flex',
  'flex-direction',
  'flex-wrap',
  'flex-grow',
  'flex-shrink',
  'flex-basis',
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'line-height',
  'letter-spacing',
  'text-transform',
  'text-align',
  'text-decoration',
  'white-space',
  'color',
  'background',
  'background-color',
  'background-image',
  'background-size',
  'background-position',
  'background-repeat',
  'border',
  'border-top',
  'border-right',
  'border-bottom',
  'border-left',
  'border-radius',
  'outline',
  'box-shadow',
  'opacity',
  'mix-blend-mode',
  'filter',
  'backdrop-filter',
  'transform',
  'transform-origin',
  'overflow',
  'overflow-x',
  'overflow-y',
] as const;

export type VisionDesignSystemPreviewComponentMeta = {
  name: string;
  selector: string;
  role: string;
};

export type VisionDesignSystemPreviewPublishMetadata = {
  previewTheme: 'light' | 'dark';
  cssVariables: Record<string, string>;
  cssClasses: string[];
  dataAttributes: Record<string, string>;
  components: VisionDesignSystemPreviewComponentMeta[];
  capturedAtIso: string;
};

export type VisionDesignSystemPublishedResourceRefs = {
  visionFileId: string;
  visionFileName: string;
  publishedAtIso: string;
  components: { id: string; name: string };
  varsClass: { id: string; name: string };
};

export function normalizeVisionResourceBaseName(input: string): string {
  const src = String(input || '').trim() || 'Vision';
  const withoutExt = src.replace(/\.[a-z0-9]+$/i, '').trim() || 'Vision';
  const cleaned = withoutExt.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, '_').trim();
  return cleaned || 'Vision';
}

function isHtmlElement(node: Element): node is HTMLElement {
  return typeof HTMLElement !== 'undefined' && node instanceof HTMLElement;
}

export function buildBakedPreviewHtmlFromRoot(root: HTMLElement | null): string {
  if (!root || typeof window === 'undefined') return '';
  const clone = root.cloneNode(true);
  if (!(clone instanceof HTMLElement)) return '';

  const sourceNodes = [root, ...Array.from(root.querySelectorAll('*')).filter(isHtmlElement)];
  const cloneNodes = [clone, ...Array.from(clone.querySelectorAll('*')).filter(isHtmlElement)];
  const len = Math.min(sourceNodes.length, cloneNodes.length);

  for (let i = 0; i < len; i++) {
    const src = sourceNodes[i];
    const dst = cloneNodes[i];
    const computed = window.getComputedStyle(src);
    const bakedStyle = BAKED_STYLE_PROPS.map((prop) => {
      const val = computed.getPropertyValue(prop).trim();
      return val ? `${prop}: ${val};` : '';
    })
      .filter(Boolean)
      .join(' ');
    if (bakedStyle) dst.setAttribute('style', bakedStyle);
    else dst.removeAttribute('style');
  }

  return clone.outerHTML.replace(/></g, '>\n<').trim();
}

export function buildVisionDesignSystemComponentsResourceMarkdown(input: {
  visionFileId: string;
  visionFileName: string;
  designSystem: VisionDesignSystemV1;
  previewMeta: VisionDesignSystemPreviewPublishMetadata | null;
  bakedPreviewHtml: string | null;
  publishedAtIso: string;
}): string {
  const readout = buildVisionDesignSystemReadout(input.designSystem);
  const components = (input.previewMeta?.components || []).slice().sort((a, b) => a.name.localeCompare(b.name));
  const lines: string[] = [];
  lines.push(`# ${input.visionFileName} Components`);
  lines.push('');
  lines.push(`- Vision file id: \`${input.visionFileId}\``);
  lines.push(`- Published at: ${input.publishedAtIso}`);
  lines.push(`- Preview captured at: ${input.previewMeta?.capturedAtIso || 'n/a'}`);
  lines.push(`- Preview theme: ${input.previewMeta?.previewTheme || 'light'}`);
  lines.push('');
  lines.push('## Full Baked Preview HTML');
  lines.push('```html');
  lines.push((input.bakedPreviewHtml || '').trim() || '<!-- preview html unavailable -->');
  lines.push('```');
  lines.push('');
  lines.push('## Component Anchors');
  if (!components.length) {
    lines.push('- No component anchor metadata captured.');
  } else {
    for (const cmp of components) {
      lines.push(`- \`${cmp.name}\``);
      lines.push(`  selector: \`${cmp.selector}\``);
      lines.push(`  role: ${cmp.role}`);
    }
  }
  lines.push('');
  lines.push('## Canonical Design System Readout');
  lines.push('```vision-design-system-readout');
  lines.push(readout);
  lines.push('```');
  lines.push('');
  return lines.join('\n').trim() + '\n';
}

export function buildVisionDesignSystemVarsClassesResourceMarkdown(input: {
  visionFileId: string;
  visionFileName: string;
  previewMeta: VisionDesignSystemPreviewPublishMetadata | null;
  publishedAtIso: string;
}): string {
  const vars = Object.entries(input.previewMeta?.cssVariables || {}).sort(([a], [b]) => a.localeCompare(b));
  const classes = (input.previewMeta?.cssClasses || []).slice().sort((a, b) => a.localeCompare(b));
  const attrs = Object.entries(input.previewMeta?.dataAttributes || {}).sort(([a], [b]) => a.localeCompare(b));
  const lines: string[] = [];
  lines.push(`# ${input.visionFileName} Variables + Classes`);
  lines.push('');
  lines.push(`- Vision file id: \`${input.visionFileId}\``);
  lines.push(`- Published at: ${input.publishedAtIso}`);
  lines.push(`- Preview captured at: ${input.previewMeta?.capturedAtIso || 'n/a'}`);
  lines.push(`- Preview theme: ${input.previewMeta?.previewTheme || 'light'}`);
  lines.push('');
  lines.push('## CSS Variables (Preview Root)');
  if (!vars.length) {
    lines.push('- No CSS variables captured.');
  } else {
    for (const [key, value] of vars) {
      lines.push(`- \`${key}\`: \`${value}\``);
    }
  }
  lines.push('');
  lines.push('## CSS Classes (Preview DOM)');
  if (!classes.length) {
    lines.push('- No CSS classes captured.');
  } else {
    for (const cls of classes) {
      lines.push(`- \`${cls}\``);
    }
  }
  lines.push('');
  lines.push('## Root Data Attributes (Preview State)');
  if (!attrs.length) {
    lines.push('- No data attributes captured.');
  } else {
    for (const [key, value] of attrs) {
      lines.push(`- \`data-${key}\`: \`${value}\``);
    }
  }
  lines.push('');
  return lines.join('\n').trim() + '\n';
}

function buildVisionDesignSystemResourcesBlock(refs: VisionDesignSystemPublishedResourceRefs): string {
  const lines: string[] = [];
  lines.push('Vision Design System Additional Resources');
  lines.push('');
  lines.push(`Vision file: ${refs.visionFileName} (${refs.visionFileId})`);
  lines.push(`Published at: ${refs.publishedAtIso}`);
  lines.push(`- Components: [${refs.components.name}](project-resource://${refs.components.id})`);
  lines.push(`- Variables + classes: [${refs.varsClass.name}](project-resource://${refs.varsClass.id})`);
  return lines.join('\n').trim();
}

export function upsertVisionDesignSystemResourcesReferenceBlock(markdown: string, refs: VisionDesignSystemPublishedResourceRefs | null): string {
  if (!refs) return removeFencedBlocks(markdown, 'vision-design-system-resources');
  const body = buildVisionDesignSystemResourcesBlock(refs);
  return upsertFencedBlock(markdown, 'vision-design-system-resources', body);
}
