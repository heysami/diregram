import { downloadTextFile } from '@/lib/client-download';
import { POST_GEN_CHECKLIST_ALL } from '@/lib/ai-checklists/post-generation-index';
import { EXPANDED_NODE_PLANNING_PROMPT } from '@/lib/ai-guides/expanded-node-planning';
import { VISION_AI_GUIDANCE_PROMPT_FROM_RESOURCES, VISION_AI_GUIDANCE_PROMPT_FROM_WEBSITE } from '@/lib/ai-guides/vision-guidance';
import { POST_GEN_CHECKLIST_VISION_IMPORT } from '@/lib/ai-checklists/post-generation-vision';
import { POST_GEN_CHECKLIST_VISION_COMPONENT_LIBRARY } from '@/lib/ai-checklists/post-generation-vision-component-library';
import { FULL_AI_PROMPT } from '@/components/ImportMarkdownModal';

export function downloadDiagramGuidesAndChecklistsBundle() {
  const bundle = [
    '# NexusMap — AI guidance + checklists (bundle)',
    '',
    '## AI guidance prompt',
    FULL_AI_PROMPT,
    '',
    '## Expanded-node parking lot template (optional)',
    EXPANDED_NODE_PLANNING_PROMPT,
    '',
    '## Post-generation checklist — ALL (combined)',
    POST_GEN_CHECKLIST_ALL,
    '',
  ].join('\n');

  downloadTextFile('nexusmap-guides-and-checklists-bundle.md', bundle);
}

export function downloadVisionGuidesAndChecklistsBundle() {
  const bundle = [
    '# Vision — AI guidance + checklists (bundle)',
    '',
    '## Prompt A — design system resources provided',
    VISION_AI_GUIDANCE_PROMPT_FROM_RESOURCES,
    '',
    '## Prompt B — discover from website',
    VISION_AI_GUIDANCE_PROMPT_FROM_WEBSITE,
    '',
    '## Post-generation checklist — Vision importability',
    POST_GEN_CHECKLIST_VISION_IMPORT,
    '',
    '## Post-generation checklist — Vision component library',
    POST_GEN_CHECKLIST_VISION_COMPONENT_LIBRARY,
    '',
  ].join('\n');

  downloadTextFile('vision-guides-and-checklists-bundle.md', bundle);
}

