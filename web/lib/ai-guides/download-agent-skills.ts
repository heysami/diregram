import { strToU8, zipSync } from 'fflate';
import { AGENT_SKILL_TEMPLATES, type AgentSkillTemplate } from '@/lib/ai-guides/agent-skill-templates';

const REQUIRED_HEADINGS = [
  '# ',
  '## Overview',
  '## Required Inputs (Blocking)',
  '## Plan (Strict Sequence — Must Follow In Order)',
  '## Blockers and Ask-User Rules',
  '## Output Contract',
  '## Guardrails',
  '## Completion Criteria',
] as const;

const REQUIRED_STRICT_PHRASES = [
  'Do not skip steps. Do not continue after a failed step.',
  'If any required input is missing, stop and ask the user before continuing.',
] as const;

function showErrorToast(message: string) {
  if (typeof window === 'undefined') return;
  const el = document.createElement('div');
  el.textContent = message;
  Object.assign(el.style, {
    position: 'fixed',
    top: '72px',
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: '6000',
    background: '#fff',
    border: '2px solid #111',
    boxShadow: '2px 2px 0 #111',
    padding: '6px 10px',
    fontSize: '12px',
    color: '#991b1b',
    maxWidth: '92vw',
  } as CSSStyleDeclaration);
  document.body.appendChild(el);
  window.setTimeout(() => el.remove(), 2800);
}

function downloadBlob(filename: string, blob: Blob) {
  const safe = filename.replace(/[^\w.\-()+ ]/g, '_').trim() || 'download.zip';
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = safe;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function parseFrontmatterKeys(markdown: string): string[] | null {
  const m = markdown.match(/^---\n([\s\S]*?)\n---\n/);
  if (!m) return null;
  const keys: string[] = [];
  const lines = String(m[1] || '').split('\n');
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const km = line.match(/^([A-Za-z0-9_-]+)\s*:/);
    if (!km) return null;
    keys.push(km[1]);
  }
  return keys;
}

function includesAllRequiredSections(markdown: string): string[] {
  const missing: string[] = [];
  for (const heading of REQUIRED_HEADINGS) {
    if (heading === '# ') {
      if (!/^#\s+.+/m.test(markdown)) missing.push('# <Skill Title>');
      continue;
    }
    if (!markdown.includes(heading)) missing.push(heading);
  }
  return missing;
}

function includesAllRequiredStrictPhrases(markdown: string): string[] {
  const missing: string[] = [];
  for (const phrase of REQUIRED_STRICT_PHRASES) {
    if (!markdown.includes(phrase)) missing.push(phrase);
  }
  return missing;
}

function validateCodexSkillMd(skill: AgentSkillTemplate): string[] {
  const path = `codex/${skill.skillName}/SKILL.md`;
  const content = skill.files[path];
  if (!content) return [`Missing file: ${path}`];

  const errors: string[] = [];
  const keys = parseFrontmatterKeys(content);
  if (!keys) {
    errors.push(`Invalid YAML frontmatter in ${path}`);
  } else {
    const allowed = new Set(['name', 'description']);
    const unique = Array.from(new Set(keys));
    for (const key of unique) {
      if (!allowed.has(key)) errors.push(`Frontmatter key not allowed in ${path}: ${key}`);
    }
    if (!unique.includes('name')) errors.push(`Missing frontmatter key in ${path}: name`);
    if (!unique.includes('description')) errors.push(`Missing frontmatter key in ${path}: description`);
  }

  const missingHeadings = includesAllRequiredSections(content);
  if (missingHeadings.length) {
    errors.push(`Missing required sections in ${path}: ${missingHeadings.join(', ')}`);
  }

  const missingPhrases = includesAllRequiredStrictPhrases(content);
  if (missingPhrases.length) {
    errors.push(`Missing strict phrases in ${path}: ${missingPhrases.join(' | ')}`);
  }

  return errors;
}

function validateClaudeCompanion(skill: AgentSkillTemplate): string[] {
  const path = `claude/${skill.skillName}.md`;
  const content = skill.files[path];
  if (!content) return [`Missing file: ${path}`];

  const errors: string[] = [];
  const missingHeadings = includesAllRequiredSections(content);
  if (missingHeadings.length) {
    errors.push(`Missing required sections in ${path}: ${missingHeadings.join(', ')}`);
  }
  const missingPhrases = includesAllRequiredStrictPhrases(content);
  if (missingPhrases.length) {
    errors.push(`Missing strict phrases in ${path}: ${missingPhrases.join(' | ')}`);
  }
  return errors;
}

function validateSkillBundle(skill: AgentSkillTemplate): string[] {
  return [...validateCodexSkillMd(skill), ...validateClaudeCompanion(skill)];
}

function downloadAgentSkillBundle(skill: AgentSkillTemplate) {
  const errors = validateSkillBundle(skill);
  if (errors.length) {
    const msg = `Skill bundle validation failed: ${errors[0]}`;
    showErrorToast(msg);
    return;
  }

  const zipEntries: Record<string, Uint8Array> = {};
  for (const [path, content] of Object.entries(skill.files)) {
    zipEntries[path] = strToU8(content, true);
  }

  const zipped = zipSync(zipEntries, { level: 6 });
  const bytes = new Uint8Array(zipped);
  const blob = new Blob([bytes], { type: 'application/zip' });
  downloadBlob(skill.zipFilename, blob);
}

function downloadMultiAgentSkillBundle(filename: string, skills: AgentSkillTemplate[]) {
  const validationErrors = skills.flatMap((skill) => validateSkillBundle(skill).map((err) => `[${skill.skillName}] ${err}`));
  if (validationErrors.length) {
    showErrorToast(`Skill bundle validation failed: ${validationErrors[0]}`);
    return;
  }

  const zipEntries: Record<string, Uint8Array> = {};
  for (const skill of skills) {
    for (const [path, content] of Object.entries(skill.files)) {
      zipEntries[path] = strToU8(content, true);
    }
  }

  const zipped = zipSync(zipEntries, { level: 6 });
  const bytes = new Uint8Array(zipped);
  const blob = new Blob([bytes], { type: 'application/zip' });
  downloadBlob(filename, blob);
}

export function downloadGenerationChecklistAgentSkillBundle() {
  downloadAgentSkillBundle(AGENT_SKILL_TEMPLATES.generationChecklist);
}

export function downloadMcpRagOperatorAgentSkillBundle() {
  downloadAgentSkillBundle(AGENT_SKILL_TEMPLATES.mcpRagOperator);
}

export function downloadUiContentSignalAuditAgentSkillBundle() {
  downloadAgentSkillBundle(AGENT_SKILL_TEMPLATES.uiContentSignalAudit);
}

export function downloadUiManagerLoopAgentSkillBundle() {
  downloadAgentSkillBundle(AGENT_SKILL_TEMPLATES.uiManagerLoop);
}

export function downloadUiQualityAgentSkillsBundle() {
  downloadMultiAgentSkillBundle('diregram-agent-skills-ui-quality-pack.zip', [
    AGENT_SKILL_TEMPLATES.uiContentSignalAudit,
    AGENT_SKILL_TEMPLATES.uiManagerLoop,
  ]);
}
