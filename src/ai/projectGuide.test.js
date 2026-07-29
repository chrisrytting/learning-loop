'use strict';

jest.mock('./client', () => ({
  callAI: jest.fn(),
  extractJsonObject: text => JSON.parse(text),
}));

const { callAI } = require('./client');
const {
  generateProjectPages,
  answerProjectCue,
  normalizeProposal,
  projectGuideAnthropicModel,
  DEFAULT_PROJECT_GUIDE_ANTHROPIC_MODEL,
  PROJECT_GUIDE_ANTHROPIC_MODELS,
  projectPagesSchema,
  PROJECT_GUIDANCE_SCHEMA,
} = require('./projectGuide');

const config = {
  name: 'Alpine+',
  sourcePath: 'Alpine+ structure/Input/Ecomm Leverage Points.md',
  outputPaths: {
    goal: 'Alpine+ structure/Goal.md',
    roadmap: 'Alpine+ structure/Roadmap.md',
    principles: 'Alpine+ structure/Principles.md',
  },
};

beforeEach(() => jest.clearAllMocks());

test('generates only the requested missing project pages', async () => {
  callAI.mockResolvedValue(JSON.stringify({ roadmap: '# Roadmap\n- [ ] Begin' }));

  const result = await generateProjectPages('Master plan', ['roadmap'], config, {}, { add: jest.fn() });

  expect(result).toEqual({ roadmap: '# Roadmap\n- [ ] Begin' });
  expect(callAI).toHaveBeenCalledWith(
    expect.any(Object),
    expect.stringContaining('Return ONLY raw JSON containing these string keys: roadmap.'),
    5000,
    expect.any(Object),
    {
      anthropicModel: DEFAULT_PROJECT_GUIDE_ANTHROPIC_MODEL,
      outputSchema: projectPagesSchema(['roadmap']),
      purpose: 'Alpine+: generate roadmap page',
    },
  );
});

test('grounds next-step guidance in current pages and normalizes a roadmap proposal', async () => {
  callAI.mockResolvedValue(JSON.stringify({
    answer: 'Film one pilot project story.',
    roadmapLocation: 'Phase 1',
    implementationIdeas: ['Promise a payoff in the opening.'],
    principleApplications: [{ principle: 'Hooks', application: 'Open with the unanswered project question.' }],
    proposedRoadmapChange: {
      heading: '## Phase 1',
      task: 'Film one pilot project story',
      rationale: 'It creates the first audience-learning loop.',
    },
  }));

  const result = await answerProjectCue('I should make a video next', {
    goal: '# Goal\nBuild an audience',
    roadmap: '# Roadmap\n## Phase 1',
    principles: '# Principles\nHooks are everything',
  }, config, {});

  expect(result.proposedRoadmapChange.heading).toBe('Phase 1');
  const prompt = callAI.mock.calls[0][1];
  expect(prompt).toContain('focus on a practical way to do it while incorporating relevant e-commerce principles');
  expect(prompt).toContain('Hooks are everything');
  expect(callAI.mock.calls[0][2]).toBe(3200);
  expect(callAI.mock.calls[0][4].effort).toBe('low');
});

test('uses the configured Project Guide model for page creation and later guidance', async () => {
  callAI
    .mockResolvedValueOnce(JSON.stringify({ goal: '# Goal' }))
    .mockResolvedValueOnce(JSON.stringify({
      answer: 'Start with one pilot.',
      roadmapLocation: 'Phase 1',
      implementationIdeas: [],
      principleApplications: [],
      proposedRoadmapChange: null,
    }));
  const settings = { projectGuideAnthropicModel: 'claude-sonnet-5' };

  await generateProjectPages('Master plan', ['goal'], config, settings);
  await answerProjectCue('What next?', {
    goal: '# Goal',
    roadmap: '# Roadmap',
    principles: '# Principles',
  }, config, settings);

  expect(callAI.mock.calls[0][4]).toEqual({
    anthropicModel: 'claude-sonnet-5',
    outputSchema: projectPagesSchema(['goal']),
    purpose: 'Alpine+: generate goal page',
  });
  expect(callAI.mock.calls[1][4]).toEqual({
    anthropicModel: 'claude-sonnet-5',
    outputSchema: PROJECT_GUIDANCE_SCHEMA,
    effort: 'low',
    purpose: 'Alpine+: answer project cue',
  });
});

test('constrains project guidance to the complete response schema', () => {
  expect(PROJECT_GUIDANCE_SCHEMA.required).toEqual([
    'answer',
    'roadmapLocation',
    'implementationIdeas',
    'principleApplications',
    'proposedRoadmapChange',
  ]);
  expect(PROJECT_GUIDANCE_SCHEMA.additionalProperties).toBe(false);
  expect(JSON.stringify(PROJECT_GUIDANCE_SCHEMA)).not.toContain('maxItems');
});

test('offers the current general-availability model tiers and defaults to Sonnet 5', () => {
  expect(projectGuideAnthropicModel({})).toBe('claude-sonnet-5');
  expect(PROJECT_GUIDE_ANTHROPIC_MODELS.map(model => model.id)).toEqual([
    'claude-haiku-4-5',
    'claude-sonnet-5',
    'claude-opus-4-8',
    'claude-fable-5',
  ]);
});

test('rejects incomplete roadmap proposals', () => {
  expect(normalizeProposal({ heading: 'Phase 1', task: '' })).toBeNull();
  expect(normalizeProposal(null)).toBeNull();
});
