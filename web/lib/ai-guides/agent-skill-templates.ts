import { POST_GEN_CHECKLIST_ALL } from '@/lib/ai-checklists/post-generation-index';
import { POST_GEN_CHECKLIST_VISION_COMPONENT_LIBRARY } from '@/lib/ai-checklists/post-generation-vision-component-library';
import { POST_GEN_CHECKLIST_VISION_IMPORT } from '@/lib/ai-checklists/post-generation-vision';
import { EXPANDED_NODE_PLANNING_PROMPT } from '@/lib/ai-guides/expanded-node-planning';
import { FULL_AI_PROMPT } from '@/lib/ai-guides/diagram-full-prompt';
import { VISION_AI_GUIDANCE_PROMPT_FROM_RESOURCES, VISION_AI_GUIDANCE_PROMPT_FROM_WEBSITE } from '@/lib/ai-guides/vision-guidance';

export type AgentSkillTemplate = {
  zipFilename: string;
  skillName: string;
  files: Record<string, string>;
};

const STANDARD_RULE_LINE = 'Do not skip steps. Do not continue after a failed step.';
const STANDARD_BLOCKING_LINE = 'If any required input is missing, stop and ask the user before continuing.';

const generationSkillName = 'diregram-generation-checklist';
const generationSkillMd = `---
name: ${generationSkillName}
description: Generate and validate Diregram Diagram and Vision outputs with a strict, non-skippable checklist sequence. Use when users need generation guidance, verification order enforcement, and explicit blocker handling.
---

# Diregram Generation Checklist

## Overview
Use this skill to run Diagram and Vision generation with strict verification discipline.
${STANDARD_RULE_LINE}

## Required Inputs (Blocking)
1. Target mode and objective: Diagram, Vision, or both.
2. Source resources in markdown form (or a clear conversion plan).
3. Constraints (domain scope, must-include content, must-avoid content).
4. Expected output format and acceptance criteria.
${STANDARD_BLOCKING_LINE}

## Plan (Strict Sequence — Must Follow In Order)
1. Validate inputs and resource readiness.
2. Choose execution mode (Diagram or Vision) and lock scope.
3. Generate outputs from provided resources only.
4. Run the required verification sequence in strict order:
   1. Data Relationship
   2. IA + Expanded
   3. Swimlane
   4. Tech Flow
5. Record failures, gaps, and missing context.
6. Ask the user for missing information and pause.
7. Re-run verification after updates.
8. Produce the final structured report.

## Blockers and Ask-User Rules
1. If source material is incomplete, ask for the missing resource before generation.
2. If verification fails, report exact failed checks and request targeted fixes.
3. If requested scope conflicts with resources, ask for scope clarification before continuing.
4. If a step fails, do not continue to the next step.

## Output Contract
1. Mode used: Diagram, Vision, or both.
2. Generation summary tied to provided resources.
3. Verification results in the fixed order with pass/fail per stage.
4. Missing-context questions, if any.
5. Final status: complete or blocked.

## Guardrails
1. Never skip or reorder plan steps.
2. Never generate content from unstated assumptions when blocked inputs are missing.
3. Never mark completion if any verification stage failed.
4. Keep recommendations tied to explicit resource evidence.

## Completion Criteria
1. All required inputs are present.
2. All plan steps completed in order.
3. Verification stages all pass in required sequence.
4. Final report delivered with no unresolved blockers.
`;

const generationOpenAiYaml = `interface:
  display_name: "Diregram Generation Checklist"
  short_description: "Generate and verify Diagram and Vision outputs"
  default_prompt: "Use $${generationSkillName} to generate and verify Diagram and Vision outputs in strict sequence."
`;

const generationReferencesDiagram = [
  '# Diagram Guidance Prompt',
  '',
  FULL_AI_PROMPT,
  '',
  '## Expanded-node Parking Template',
  '',
  EXPANDED_NODE_PLANNING_PROMPT,
  '',
].join('\n');

const generationReferencesDiagramChecklist = [
  '# Diagram Post-generation Checklist (Combined)',
  '',
  POST_GEN_CHECKLIST_ALL,
  '',
].join('\n');

const generationReferencesVision = [
  '# Vision Guidance Prompts',
  '',
  '## Prompt A: Resources Provided',
  '',
  VISION_AI_GUIDANCE_PROMPT_FROM_RESOURCES,
  '',
  '## Prompt B: Discover from Website',
  '',
  VISION_AI_GUIDANCE_PROMPT_FROM_WEBSITE,
  '',
].join('\n');

const generationReferencesVisionChecklist = [
  '# Vision Post-generation Checklists',
  '',
  '## Vision Importability',
  '',
  POST_GEN_CHECKLIST_VISION_IMPORT,
  '',
  '## Vision Component Library',
  '',
  POST_GEN_CHECKLIST_VISION_COMPONENT_LIBRARY,
  '',
].join('\n');

const generationVerificationOrder = [
  '# Verification Order (Mandatory)',
  '',
  'Run these checks in order and do not skip any stage:',
  '',
  '1. Data Relationship',
  '2. IA + Expanded',
  '3. Swimlane',
  '4. Tech Flow',
  '',
  STANDARD_RULE_LINE,
  STANDARD_BLOCKING_LINE,
  '',
].join('\n');

const generationClaudePrompt = [
  '# Diregram Generation Checklist (Claude)',
  '',
  'Use this instruction as a strict execution contract.',
  '',
  generationSkillMd.replace(/^---[\s\S]*?---\n\n/, ''),
].join('\n');

const mcpSkillName = 'diregram-mcp-rag-operator';
const mcpSkillMd = `---
name: ${mcpSkillName}
description: Operate Diregram RAG via MCP tools using a strict decision tree. Use when selecting projects, setting keys, running scoped RAG queries, and handling missing context without tool drift.
---

# Diregram MCP RAG Operator

## Overview
Use this skill to run Diregram MCP calls with strict tool sequencing and scope control.
${STANDARD_RULE_LINE}

## Required Inputs (Blocking)
1. Confirmed token scope: account token or project token.
2. User question for RAG retrieval.
3. OpenAI key availability path: session key, inline key, or server-side key.
4. Project target when token scope is account.
${STANDARD_BLOCKING_LINE}

## Plan (Strict Sequence — Must Follow In Order)
1. Identify token scope (account vs project).
2. Ensure OpenAI key is available via diregram_set_openai_key or user-provided key.
3. If token is account-scoped, run diregram_list_projects.
4. If token is account-scoped, run diregram_set_project using a selected public project id.
5. Run diregram_rag_query.
6. If response is insufficient, ask precise follow-up questions.
7. Return answer with explicit context limitations.

## Blockers and Ask-User Rules
1. If token scope is unknown, ask user before any query call.
2. If account token has no selected project, ask user to choose project id from list.
3. If key is missing, ask user for key path before query.
4. If tool returns missing-project or auth errors, explain fix and stop.

## Output Contract
1. Token scope used and project selection status.
2. Tool sequence executed in order.
3. RAG answer or retrieval output with explicit uncertainty.
4. Follow-up questions for missing context.
5. Final status: complete or blocked.

## Guardrails
1. Never call diregram_rag_query for account token before project selection.
2. Never proceed without key availability.
3. Never substitute unrelated tools for Diregram RAG tasks.
4. Never hide missing context; ask user directly and pause.

## Completion Criteria
1. Required inputs are present.
2. Sequential plan executed without skipped steps.
3. Query executed with valid scope and key path.
4. Final output contains answer plus limitations or blocker reason.
`;

const mcpOpenAiYaml = `interface:
  display_name: "Diregram MCP RAG Operator"
  short_description: "Use Diregram MCP tools in strict order"
  default_prompt: "Use $${mcpSkillName} to run Diregram MCP RAG in strict sequence with project and key gating."
`;

const mcpReferenceTools = [
  '# MCP Tool Contract (Diregram Hosted MCP)',
  '',
  '## Tools',
  '1. diregram_set_openai_key',
  '2. diregram_list_projects (account token only)',
  '3. diregram_set_project (account token only)',
  '4. diregram_rag_query',
  '',
  '## Query Args',
  '- query: required string',
  '- topK: optional integer 1..50 (default 12)',
  '- generateAnswer: optional boolean (default true)',
  '- openaiApiKey: optional string',
  '- embeddingModel: optional string',
  '- chatModel: optional string',
  '',
  '## Non-skippable Ordering Rules',
  '- Account token flow: list_projects -> set_project -> rag_query',
  '- Project token flow: rag_query directly',
  '- Key required before rag_query (session key, inline key, or server key)',
  '',
  STANDARD_RULE_LINE,
  '',
].join('\n');

const mcpReferenceRagScope = [
  '# RAG Coverage and Limits',
  '',
  'RAG retrieval is scoped to ingested project knowledge base content. It can contain:',
  '- Diagram semantic exports',
  '- Vision semantic exports',
  '- Note semantic exports',
  '- Template files',
  '- Test files',
  '- Imported project resources (for example Docling markdown)',
  '',
  'RAG cannot answer reliably when:',
  '- Knowledge base was not built for target project',
  '- Wrong project is selected',
  '- Source resources were never imported',
  '- Question asks for content outside ingested scope',
  '',
  'When scope is missing or ambiguous, ask the user for project or source clarification before continuing.',
  '',
].join('\n');

const mcpReferenceErrors = [
  '# Error to Recovery Map',
  '',
  '## Missing project',
  '- Error pattern: Missing project',
  '- Recovery: run diregram_list_projects, ask user to pick project, run diregram_set_project, retry query',
  '',
  '## Missing key',
  '- Error pattern: OpenAI key required',
  '- Recovery: run diregram_set_openai_key or ask user for key path, retry query',
  '',
  '## Unknown project',
  '- Error pattern: Unknown project',
  '- Recovery: refresh project list and reselect valid public project id',
  '',
  '## Scope mismatch',
  '- Error pattern: list/set project requires account token',
  '- Recovery: skip list/set flow for project-scoped token and run query directly',
  '',
  STANDARD_BLOCKING_LINE,
  STANDARD_RULE_LINE,
  '',
].join('\n');

const mcpClaudePrompt = [
  '# Diregram MCP RAG Operator (Claude)',
  '',
  'Use this instruction as a strict execution contract.',
  '',
  mcpSkillMd.replace(/^---[\s\S]*?---\n\n/, ''),
].join('\n');

export const AGENT_SKILL_TEMPLATES: Record<'generationChecklist' | 'mcpRagOperator', AgentSkillTemplate> = {
  generationChecklist: {
    zipFilename: 'diregram-agent-skill-generation-checklist.zip',
    skillName: generationSkillName,
    files: {
      [`codex/${generationSkillName}/SKILL.md`]: generationSkillMd,
      [`codex/${generationSkillName}/agents/openai.yaml`]: generationOpenAiYaml,
      [`codex/${generationSkillName}/references/diagram-guidance.md`]: generationReferencesDiagram,
      [`codex/${generationSkillName}/references/diagram-post-generation-checklist.md`]: generationReferencesDiagramChecklist,
      [`codex/${generationSkillName}/references/vision-guidance.md`]: generationReferencesVision,
      [`codex/${generationSkillName}/references/vision-post-generation-checklists.md`]: generationReferencesVisionChecklist,
      [`codex/${generationSkillName}/references/verification-order.md`]: generationVerificationOrder,
      [`claude/${generationSkillName}.md`]: generationClaudePrompt,
    },
  },
  mcpRagOperator: {
    zipFilename: 'diregram-agent-skill-mcp-rag-operator.zip',
    skillName: mcpSkillName,
    files: {
      [`codex/${mcpSkillName}/SKILL.md`]: mcpSkillMd,
      [`codex/${mcpSkillName}/agents/openai.yaml`]: mcpOpenAiYaml,
      [`codex/${mcpSkillName}/references/mcp-tool-contract.md`]: mcpReferenceTools,
      [`codex/${mcpSkillName}/references/rag-coverage-and-limits.md`]: mcpReferenceRagScope,
      [`codex/${mcpSkillName}/references/error-recovery.md`]: mcpReferenceErrors,
      [`claude/${mcpSkillName}.md`]: mcpClaudePrompt,
    },
  },
};
