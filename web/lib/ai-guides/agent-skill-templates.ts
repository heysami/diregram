import {
  POST_GEN_CHECKLIST_ALL,
  POST_GEN_CHECKLIST_COMPLETENESS,
  POST_GEN_CHECKLIST_CONDITIONAL,
  POST_GEN_CHECKLIST_DATA_OBJECTS,
  POST_GEN_CHECKLIST_EXPANDED_NODES,
  POST_GEN_CHECKLIST_IA,
  POST_GEN_CHECKLIST_PROCESS_FLOWS,
  POST_GEN_CHECKLIST_SINGLE_SCREEN_STEPS,
  POST_GEN_CHECKLIST_SWIMLANE,
  POST_GEN_CHECKLIST_SYSTEM_FLOW,
  POST_GEN_CHECKLIST_TAGS,
  POST_GEN_CHECKLIST_TECHNICAL,
} from '@/lib/ai-checklists/post-generation-index';
import { POST_GEN_CHECKLIST_VISION_COMPONENT_LIBRARY } from '@/lib/ai-checklists/post-generation-vision-component-library';
import { POST_GEN_CHECKLIST_VISION_IMPORT } from '@/lib/ai-checklists/post-generation-vision';
import { EXPANDED_NODE_PLANNING_PROMPT } from '@/lib/ai-guides/expanded-node-planning';
import { FULL_AI_PROMPT } from '@/lib/ai-guides/diagram-full-prompt';
import { SINGLE_SCREEN_STEPS_GUIDE } from '@/lib/ai-guides/single-screen-steps';
import { VISION_AI_GUIDANCE_PROMPT_FROM_RESOURCES, VISION_AI_GUIDANCE_PROMPT_FROM_WEBSITE } from '@/lib/ai-guides/vision-guidance';

export type AgentSkillTemplate = {
  zipFilename: string;
  skillName: string;
  files: Record<string, string>;
};

export type AgentSkillTemplateKey =
  | 'generationChecklist'
  | 'mcpRagOperator'
  | 'uiContentSignalAudit'
  | 'uiManagerLoop';

const STANDARD_RULE_LINE = 'Do not skip steps. Do not continue after a failed step.';
const STANDARD_BLOCKING_LINE = 'If any required input is missing, stop and ask the user before continuing.';

const generationSkillName = 'diregram-generation-checklist';
const generationSkillMd = `---
name: ${generationSkillName}
description: Generate and validate Diregram Diagram and Vision outputs with a strict, non-skippable checklist sequence. Use when users need generation guidance, verification order enforcement, and explicit blocker handling. Always follow this SKILL.md plus references/verification-order.md and references/checklists/*.md as the required guide/checklist files.
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
  short_description: "Guide/checklist-driven Diagram + Vision generation"
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

function formatReference(title: string, body: string) {
  return ['# ' + title, '', body, ''].join('\n');
}

const generationChecklistAll = formatReference('Checklist - Post-generation (ALL)', POST_GEN_CHECKLIST_ALL);
const generationChecklistTechnical = formatReference('Checklist - Technical', POST_GEN_CHECKLIST_TECHNICAL);
const generationChecklistIa = formatReference('Checklist - IA', POST_GEN_CHECKLIST_IA);
const generationChecklistExpandedNodes = formatReference('Checklist - Expanded Nodes', POST_GEN_CHECKLIST_EXPANDED_NODES);
const generationChecklistTags = formatReference('Checklist - Tags', POST_GEN_CHECKLIST_TAGS);
const generationChecklistProcessFlows = formatReference('Checklist - Process Flows', POST_GEN_CHECKLIST_PROCESS_FLOWS);
const generationChecklistSingleScreenSteps = formatReference(
  'Checklist - Single Screen Steps',
  POST_GEN_CHECKLIST_SINGLE_SCREEN_STEPS,
);
const generationChecklistTechFlow = formatReference('Checklist - Tech Flow', POST_GEN_CHECKLIST_SYSTEM_FLOW);
const generationChecklistConditional = formatReference('Checklist - Conditional', POST_GEN_CHECKLIST_CONDITIONAL);
const generationChecklistDataRelationship = formatReference('Checklist - Data Relationship', POST_GEN_CHECKLIST_DATA_OBJECTS);
const generationChecklistSwimlane = formatReference('Checklist - Swimlane', POST_GEN_CHECKLIST_SWIMLANE);
const generationChecklistCompleteness = formatReference('Checklist - Completeness', POST_GEN_CHECKLIST_COMPLETENESS);
const generationChecklistVisionImport = formatReference('Checklist - Vision Importability', POST_GEN_CHECKLIST_VISION_IMPORT);
const generationChecklistVisionComponentLibrary = formatReference(
  'Checklist - Vision Component Library',
  POST_GEN_CHECKLIST_VISION_COMPONENT_LIBRARY,
);
const generationSingleScreenStepsGuide = formatReference('Guide - Single Screen Steps', SINGLE_SCREEN_STEPS_GUIDE);

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
description: Operate Diregram RAG via MCP tools using a strict decision tree. Use when selecting projects, setting keys, running scoped RAG queries, and handling missing context without tool drift. Always follow this SKILL.md plus references/mcp-tool-contract.md and references/error-recovery.md as the required guide/checklist files.
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
  short_description: "Guide/checklist-driven Diregram MCP tool flow"
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

const uiContentSignalAuditSkillName = 'diregram-ui-content-signal-audit';
const uiContentSignalAuditSkillMd = `---
name: ${uiContentSignalAuditSkillName}
description: Audit and rewrite UI text for signal-to-noise, task clarity, and discoverability using screenshot-first evidence and strict action ordering. Always follow this SKILL.md plus references/rubric.md and references/templates.md as the required guide/checklist files.
---

# Diregram UI Content Signal Audit

## Overview
Use this skill to run a screenshot-first content-signal audit over in-product UI copy.
${STANDARD_RULE_LINE}

## Required Inputs (Blocking)
1. Screenshot evidence for each scoped page and key overlays/states.
2. User type, tone constraints, and must-keep legal/terminology constraints.
3. Scope boundaries for flows/screens to audit.
4. Discoverability baseline (which controls/actions are visible in scoped UI states).
${STANDARD_BLOCKING_LINE}

## Plan (Strict Sequence — Must Follow In Order)
1. Validate evidence coverage (screens + overlays + state variants).
2. Build whole-screen scan-flow model before local string edits.
3. Inventory strings with screenshot anchors and hierarchy context.
4. Run helper/subtitle default-remove gate and net-new delta proof.
5. Run reference/discoverability gate (remove misleading action references).
6. Resolve action classes in strict order: remove -> relayout/redesign -> replace -> add.
7. Create handoff queue for relayout/redesign items to ui-manager-loop.
8. Re-audit after manager-loop return and close only when relayout queue is cleared or explicitly deferred.
9. Return patch-ready copy deltas with evidence anchors.

## Blockers and Ask-User Rules
1. If screenshot coverage is incomplete for critical areas, ask for missing evidence and pause final sign-off.
2. If discoverability cannot be verified from evidence, ask for a reproducible UI state and pause final verdict.
3. If relayout/redesign items exist without handoff details, block completion.
4. If missing clarity is found but no add candidates are produced, block completion.

## Output Contract
1. Intake summary (user type, tone, constraints).
2. Whole-screen scan-flow map and redundancy clusters.
3. String inventory with action class and evidence anchor.
4. Must-remove list and relayout/redesign list.
5. Replace and add proposals with exact insertion slot.
6. ui-manager-loop handoff queue (impact, constraints, acceptance criteria).
7. Final status: complete or blocked.

## Guardrails
1. No text-only audit without screenshot context.
2. Do not keep helper/subtitle copy by default.
3. Do not invent functionality in copy.
4. Do not bypass action priority ordering.
5. Do not close while unresolved relayout/redesign items remain without explicit defer decision.

## Completion Criteria
1. Evidence coverage is complete for scoped critical screens/states.
2. Action ordering was applied correctly.
3. All relayout/redesign items are handed off and tracked.
4. Output includes patch-ready copy changes with anchors.
`;

const uiContentSignalAuditOpenAiYaml = `interface:
  display_name: "Diregram UI Content Signal Audit"
  short_description: "Guide/checklist-driven screenshot-first content audit"
  default_prompt: "Use $${uiContentSignalAuditSkillName} to run a whole-screen-first content signal audit, enforce remove->relayout->replace->add ordering, and return screenshot-anchored changes plus manager-loop handoff items."
`;

const uiContentSignalAuditReferenceRubric = [
  '# Content Signal Rubric (Concise)',
  '',
  '## Required order',
  '1. Remove',
  '2. Relayout/redesign UI presentation',
  '3. Replace',
  '4. Add',
  '',
  '## Keep criteria',
  '- Adds net-new decision value in current scan moment.',
  '- Not already conveyed by global context, visual hierarchy, or nearby controls.',
  '- Reference target is discoverable in rendered UI.',
  '',
  '## Blockers',
  '- Missing screenshot evidence for critical scope.',
  '- Instruction text pointing to non-discoverable control.',
  '- Relayout findings emitted without manager-loop handoff packet.',
].join('\n');

const uiContentSignalAuditReferenceTemplates = [
  '# UI Content Audit Templates',
  '',
  '## String Row',
  '- id:',
  '- text:',
  '- screenshot_anchor:',
  '- hierarchy_group:',
  '- action: keep/tighten/remove/relayout/replace/add',
  '- rationale:',
  '',
  '## Relayout Handoff Row',
  '- relayout_id:',
  '- issue:',
  '- user_impact:',
  '- constraints:',
  '- acceptance_criteria:',
  '- status: pending/in_review/cleared/deferred',
].join('\n');

const uiContentSignalAuditClaudePrompt = [
  '# Diregram UI Content Signal Audit (Claude)',
  '',
  'Use this instruction as a strict execution contract.',
  '',
  uiContentSignalAuditSkillMd.replace(/^---[\s\S]*?---\n\n/, ''),
].join('\n');

const uiManagerLoopSkillName = 'diregram-ui-manager-loop';
const uiManagerLoopSkillMd = `---
name: ${uiManagerLoopSkillName}
description: Evaluate UI/UX with original manager-loop metrics plus mandatory Diregram design-system match gates for MCP-generated app outputs. Always follow this SKILL.md plus references/framework.md and references/templates.md as the required guide/checklist files.
---

# Diregram UI Manager Loop

## Overview
Use this skill to run measure -> propose -> approve -> apply loops for UI quality.
Keep original manager-loop metrics and add mandatory design-system match checks.
${STANDARD_RULE_LINE}

## Required Inputs (Blocking)
1. Target outcomes, avoid outcomes, target emotions, and avoid emotions.
2. Scope surfaces and state coverage to evaluate.
3. Design-system source (prefer visionjson.designSystem, then vision-design-system/readout).
4. Required control families and explicit waiver policy.
${STANDARD_BLOCKING_LINE}

## Plan (Strict Sequence — Must Follow In Order)
1. Confirm intake and tradeoff order.
2. Gather rendered evidence and design-system source evidence.
3. Run baseline manager metrics (Visual Fidelity, Cognitive Load, Interaction Fidelity, Style Direction, UX Flow, System Interaction).
4. Run additional DS diagnostics: DS_tok, DS_comp, DS_mat.
5. Build strict required-control table with verdict per family: match/mismatch/waived.
6. Route non-linearly based on failures and remeasure after each loop.
7. Propose changes with expected metric direction and control-family linkage.
8. Ask for explicit approval before apply.
9. Apply approved changes and re-measure.
10. Close only when original metric goals pass and required DS control gate passes (or waivers are explicit).

## Blockers and Ask-User Rules
1. If design-system source is missing, ask for it; if unavailable, mark inference and confidence limits.
2. If required controls mismatch, block sign-off unless explicit waiver is provided.
3. If system realism has blocking flags, pause style polish and resolve realism first.
4. If critical state coverage is missing, stop and request missing state evidence.

## Output Contract
1. Intake summary and tradeoff policy.
2. Original manager-loop scorecard (unchanged metric names).
3. DS diagnostics (DS_tok, DS_comp, DS_mat).
4. Required-control match table and DS_required_match verdict.
5. System realism findings (Sys_flags, State_map, Dependency_map, Mitigation_plan, Assumption_log).
6. Proposal set + approval request + post-apply remeasure.
7. Final status: complete or blocked.

## Guardrails
1. Do not remove or rename original manager-loop metrics.
2. Do not pass DS gate based on numeric closeness alone for required controls.
3. Do not apply changes before explicit approval.
4. Do not treat system-dependent actions as instant by default.
5. Honor strictNoDarkMode when required by design-system policy.

## Completion Criteria
1. Original priority metrics are in acceptable bands.
2. DS_required_match is pass or explicit waivers are recorded.
3. No blocking system realism flags remain.
4. Output includes evidence anchors and re-measurement.
`;

const uiManagerLoopOpenAiYaml = `interface:
  display_name: "Diregram UI Manager Loop"
  short_description: "Guide/checklist-driven manager-loop + DS match gate"
  default_prompt: "Use $${uiManagerLoopSkillName} to run original manager-loop scoring and add strict required-control design-system matching for MCP-generated app UI before final sign-off."
`;

const uiManagerLoopReferenceFramework = [
  '# UI Manager Loop Framework (Concise)',
  '',
  '## Original metric families (unchanged)',
  '- Visual Fidelity: S, S_vf, W_fit, T, V_hue',
  '- Cognitive Load: S_eff, CL_step, CL_flow, CL_long, CL_journey',
  '- Interaction Fidelity: I_score, A_amb',
  '- Style Direction: B_cons, S_palette, D_style, V_vibe',
  '- UX Flow: U_flow, F_life, P_user, D_arch, N_nav, F_nav, R_step',
  '- System realism: Sys_flags, State_map, Dependency_map, Mitigation_plan, Assumption_log',
  '',
  '## Additional DS diagnostics',
  '- DS_tok, DS_comp, DS_mat',
  '- DS_required_match (pass/fail)',
  '- DS_required_table (match/mismatch/waived per control family)',
  '',
  '## Required control families',
  '- Typography',
  '- Spacing',
  '- Shape/composition',
  '- Color + semantic mapping',
  '- Material behavior',
  '- Dark mode policy (strictNoDarkMode if set)',
  '',
  '## Gate policy',
  '- Required mismatch blocks sign-off unless explicit waiver exists.',
  '- Numeric proximity does not override mismatch verdict for required contracts.',
].join('\n');

const uiManagerLoopReferenceTemplates = [
  '# UI Manager Loop Templates',
  '',
  '## Scorecard (original metrics + DS diagnostics)',
  '- original_metrics:',
  '- ds_diagnostics:',
  '- ds_required_match:',
  '',
  '## Required-control row',
  '- family:',
  '- required: yes/no',
  '- target:',
  '- observed:',
  '- verdict: match/mismatch/waived',
  '- evidence_anchor:',
  '',
  '## Proposal row',
  '- proposal:',
  '- expected_metric_direction:',
  '- control_family_linkage:',
  '- risk:',
  '- requires_approval: yes',
].join('\n');

const uiManagerLoopClaudePrompt = [
  '# Diregram UI Manager Loop (Claude)',
  '',
  'Use this instruction as a strict execution contract.',
  '',
  uiManagerLoopSkillMd.replace(/^---[\s\S]*?---\n\n/, ''),
].join('\n');

export const AGENT_SKILL_TEMPLATES: Record<AgentSkillTemplateKey, AgentSkillTemplate> = {
  generationChecklist: {
    zipFilename: 'diregram-agent-skill-generation-checklist.zip',
    skillName: generationSkillName,
    files: {
      [`codex/${generationSkillName}/SKILL.md`]: generationSkillMd,
      [`codex/${generationSkillName}/agents/openai.yaml`]: generationOpenAiYaml,
      [`codex/${generationSkillName}/references/diagram-guidance.md`]: generationReferencesDiagram,
      [`codex/${generationSkillName}/references/vision-guidance.md`]: generationReferencesVision,
      [`codex/${generationSkillName}/references/verification-order.md`]: generationVerificationOrder,
      [`codex/${generationSkillName}/references/checklists/00-post-generation-all.md`]: generationChecklistAll,
      [`codex/${generationSkillName}/references/checklists/01-technical.md`]: generationChecklistTechnical,
      [`codex/${generationSkillName}/references/checklists/02-ia.md`]: generationChecklistIa,
      [`codex/${generationSkillName}/references/checklists/03-expanded-nodes.md`]: generationChecklistExpandedNodes,
      [`codex/${generationSkillName}/references/checklists/04-tags.md`]: generationChecklistTags,
      [`codex/${generationSkillName}/references/checklists/05-process-flows.md`]: generationChecklistProcessFlows,
      [`codex/${generationSkillName}/references/checklists/06-single-screen-steps.md`]: generationChecklistSingleScreenSteps,
      [`codex/${generationSkillName}/references/checklists/07-tech-flow.md`]: generationChecklistTechFlow,
      [`codex/${generationSkillName}/references/checklists/08-conditional.md`]: generationChecklistConditional,
      [`codex/${generationSkillName}/references/checklists/09-data-relationship.md`]: generationChecklistDataRelationship,
      [`codex/${generationSkillName}/references/checklists/10-swimlane.md`]: generationChecklistSwimlane,
      [`codex/${generationSkillName}/references/checklists/11-completeness.md`]: generationChecklistCompleteness,
      [`codex/${generationSkillName}/references/checklists/12-vision-importability.md`]: generationChecklistVisionImport,
      [`codex/${generationSkillName}/references/checklists/13-vision-component-library.md`]:
        generationChecklistVisionComponentLibrary,
      [`codex/${generationSkillName}/references/checklists/14-guide-single-screen-steps.md`]: generationSingleScreenStepsGuide,
      // Keep combined references for backward compatibility with earlier downloads.
      [`codex/${generationSkillName}/references/diagram-post-generation-checklist.md`]: generationReferencesDiagramChecklist,
      [`codex/${generationSkillName}/references/vision-post-generation-checklists.md`]: generationReferencesVisionChecklist,
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
  uiContentSignalAudit: {
    zipFilename: 'diregram-agent-skill-ui-content-signal-audit.zip',
    skillName: uiContentSignalAuditSkillName,
    files: {
      [`codex/${uiContentSignalAuditSkillName}/SKILL.md`]: uiContentSignalAuditSkillMd,
      [`codex/${uiContentSignalAuditSkillName}/agents/openai.yaml`]: uiContentSignalAuditOpenAiYaml,
      [`codex/${uiContentSignalAuditSkillName}/references/rubric.md`]: uiContentSignalAuditReferenceRubric,
      [`codex/${uiContentSignalAuditSkillName}/references/templates.md`]: uiContentSignalAuditReferenceTemplates,
      [`claude/${uiContentSignalAuditSkillName}.md`]: uiContentSignalAuditClaudePrompt,
    },
  },
  uiManagerLoop: {
    zipFilename: 'diregram-agent-skill-ui-manager-loop.zip',
    skillName: uiManagerLoopSkillName,
    files: {
      [`codex/${uiManagerLoopSkillName}/SKILL.md`]: uiManagerLoopSkillMd,
      [`codex/${uiManagerLoopSkillName}/agents/openai.yaml`]: uiManagerLoopOpenAiYaml,
      [`codex/${uiManagerLoopSkillName}/references/framework.md`]: uiManagerLoopReferenceFramework,
      [`codex/${uiManagerLoopSkillName}/references/templates.md`]: uiManagerLoopReferenceTemplates,
      [`claude/${uiManagerLoopSkillName}.md`]: uiManagerLoopClaudePrompt,
    },
  },
};
