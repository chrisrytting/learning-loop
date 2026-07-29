'use strict';

const { callAI, extractJsonObject } = require('./client');

const DEFAULT_PROJECT_GUIDE_ANTHROPIC_MODEL = 'claude-sonnet-5';
const PROJECT_GUIDE_ANTHROPIC_MODELS = Object.freeze([
  { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5 — fastest, lowest cost' },
  { id: 'claude-sonnet-5', label: 'Claude Sonnet 5 — recommended' },
  { id: 'claude-opus-4-8', label: 'Claude Opus 4.8 — complex reasoning' },
  { id: 'claude-fable-5', label: 'Claude Fable 5 — highest capability and cost' },
]);

function projectGuideAnthropicModel(settings) {
  return String(settings?.projectGuideAnthropicModel || '').trim()
    || DEFAULT_PROJECT_GUIDE_ANTHROPIC_MODEL;
}

function projectPagesSchema(missingKeys) {
  return {
    type: 'object',
    properties: Object.fromEntries(missingKeys.map(key => [key, { type: 'string' }])),
    required: [...missingKeys],
    additionalProperties: false,
  };
}

const PROJECT_GUIDANCE_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    answer: { type: 'string' },
    roadmapLocation: { type: 'string' },
    implementationIdeas: {
      type: 'array',
      items: { type: 'string' },
    },
    principleApplications: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          principle: { type: 'string' },
          application: { type: 'string' },
        },
        required: ['principle', 'application'],
        additionalProperties: false,
      },
    },
    proposedRoadmapChange: {
      anyOf: [
        {
          type: 'object',
          properties: {
            heading: { type: 'string' },
            task: { type: 'string' },
            rationale: { type: 'string' },
          },
          required: ['heading', 'task', 'rationale'],
          additionalProperties: false,
        },
        { type: 'null' },
      ],
    },
  },
  required: [
    'answer',
    'roadmapLocation',
    'implementationIdeas',
    'principleApplications',
    'proposedRoadmapChange',
  ],
  additionalProperties: false,
});

async function generateProjectPages(source, missingKeys, config, settings, collector = null) {
  const requested = missingKeys.join(', ');
  const prompt = [
    `Create working-draft project pages for ${config.name}.`,
    `Return ONLY raw JSON containing these string keys: ${requested}.`,
    '',
    'The pages are editable proposals, not immutable plans. Each page must begin with its matching H1 (`# Goal`, `# Roadmap`, or `# Principles`), followed by an italicized sentence saying it is a working draft that should be edited as the project teaches us more.',
    'Requirements:',
    '- goal: one overarching goal, a concise definition of success, and a few observable outcomes. Do not turn it into a task list.',
    '- roadmap: ordered phases using level-two headings and actionable Markdown checkboxes (`- [ ]`). Put audience and learning foundations before monetization. Include dependencies where useful. Preserve uncertainty instead of inventing dates or metrics.',
    '- principles: practical principles adapted from the source. Separate principles useful now, principles useful when introducing products, and later-stage paid acquisition/operations principles. Keep important nuance from the source.',
    `- Link to the source as [[${config.sourcePath.replace(/\.md$/i, '')}|Ecomm Leverage Points]].`,
    `- Where useful, cross-link [[${config.outputPaths.goal.replace(/\.md$/i, '')}|Goal]], [[${config.outputPaths.roadmap.replace(/\.md$/i, '')}|Roadmap]], and [[${config.outputPaths.principles.replace(/\.md$/i, '')}|Principles]].`,
    '- Do not include JSON code fences.',
    '',
    '<source_document>',
    source,
    '</source_document>',
  ].join('\n');

  const raw = await callAI(settings, prompt, 5000, collector, {
    anthropicModel: projectGuideAnthropicModel(settings),
    outputSchema: projectPagesSchema(missingKeys),
    purpose: `${config.name}: generate ${missingKeys.join(', ')} page${missingKeys.length === 1 ? '' : 's'}`,
  });
  const parsed = extractJsonObject(raw);
  const generated = {};
  for (const key of missingKeys) {
    if (typeof parsed[key] !== 'string' || !parsed[key].trim()) {
      throw new Error(`AI did not return a usable ${key} page.`);
    }
    generated[key] = parsed[key].trim();
  }
  return generated;
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value.map(item => String(item || '').trim()).filter(Boolean).slice(0, 6);
}

function normalizePrinciples(value) {
  if (!Array.isArray(value)) return [];
  return value.map(item => ({
    principle: String(item?.principle || '').trim(),
    application: String(item?.application || '').trim(),
  })).filter(item => item.principle && item.application).slice(0, 5);
}

function normalizeProposal(value) {
  if (!value || typeof value !== 'object') return null;
  const heading = String(value.heading || '').replace(/^#{1,6}\s+/, '').trim();
  const task = String(value.task || '')
    .trim()
    .replace(/^[-*+]\s+(?:\[[ xX]\]\s+)?/, '')
    .trim();
  const rationale = String(value.rationale || '').trim();
  if (!heading || !task) return null;
  return { heading, task, rationale };
}

async function answerProjectCue(cue, pages, config, settings, collector = null) {
  const prompt = [
    `You are the project guide for ${config.name}. Ground every recommendation in the current Goal, Roadmap, and Principles pages below.`,
    'Return ONLY raw JSON with this shape:',
    '{"answer":"","roadmapLocation":"","implementationIdeas":[],"principleApplications":[{"principle":"","application":""}],"proposedRoadmapChange":null}',
    '',
    'Behavior:',
    '- For “What should I do next?”, use roadmap order, checked/unchecked state, and dependencies to name one concrete next action and explain why.',
    '- If the user says they need to do something, locate it in the roadmap. If it is absent or the roadmap would be clearer with it, propose one checkbox task and the exact existing heading under which it belongs.',
    '- If the user says they should do something next, focus on a practical way to do it while incorporating relevant e-commerce principles. Also identify its roadmap location and any prerequisites, but do not merely argue about ordering.',
    '- Never claim the roadmap was changed. proposedRoadmapChange is only a proposal that the user may explicitly approve.',
    '- Use null for proposedRoadmapChange when no roadmap edit is useful.',
    '- Keep the answer concise and concrete. Do not invent completed work, dates, audience size, or budgets.',
    '',
    `<cue>${cue}</cue>`,
    '<goal_page>', pages.goal, '</goal_page>',
    '<roadmap_page>', pages.roadmap, '</roadmap_page>',
    '<principles_page>', pages.principles, '</principles_page>',
  ].join('\n');

  const raw = await callAI(settings, prompt, 3200, collector, {
    anthropicModel: projectGuideAnthropicModel(settings),
    outputSchema: PROJECT_GUIDANCE_SCHEMA,
    effort: 'low',
    purpose: `${config.name}: answer project cue`,
  });
  const parsed = extractJsonObject(raw);
  const answer = String(parsed.answer || '').trim();
  if (!answer) throw new Error('AI returned an empty recommendation.');
  return {
    answer,
    roadmapLocation: String(parsed.roadmapLocation || '').trim(),
    implementationIdeas: normalizeStringArray(parsed.implementationIdeas),
    principleApplications: normalizePrinciples(parsed.principleApplications),
    proposedRoadmapChange: normalizeProposal(parsed.proposedRoadmapChange),
  };
}

module.exports = {
  generateProjectPages,
  answerProjectCue,
  normalizeStringArray,
  normalizePrinciples,
  normalizeProposal,
  projectGuideAnthropicModel,
  DEFAULT_PROJECT_GUIDE_ANTHROPIC_MODEL,
  PROJECT_GUIDE_ANTHROPIC_MODELS,
  projectPagesSchema,
  PROJECT_GUIDANCE_SCHEMA,
};
