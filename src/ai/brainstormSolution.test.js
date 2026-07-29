'use strict';

jest.mock('./client', () => ({
  callAI: jest.fn(),
  extractJsonObject: text => JSON.parse(text),
}));

const { callAI } = require('./client');
const { parseBrainstormSolution, conciseFallback, DEFAULT_BRAINSTORM_ANTHROPIC_MODEL } = require('./brainstormSolution');

test('parses one concise solution from an interview response', async () => {
  callAI.mockResolvedValue(JSON.stringify({ solution: 'Ask a mentor for one concrete next step' }));

  const solution = await parseBrainstormSolution(
    'I am stuck on a decision',
    'If a friend had this problem, what would you tell them?',
    'I would tell them to ask someone experienced what one thing they should try next.',
    { aiProvider: 'ollama' },
  );

  expect(solution).toBe('Ask a mentor for one concrete next step');
});

test('uses the configured brainstorming Anthropic model override', async () => {
  callAI.mockResolvedValue(JSON.stringify({ solution: 'Ask for one concrete next step' }));

  await parseBrainstormSolution(
    'I am stuck on a decision',
    'If a friend had this problem, what would you tell them?',
    'Ask someone experienced what one thing to try next.',
    { aiProvider: 'anthropic', anthropicApiKey: 'sk-test', brainstormAnthropicModel: 'claude-opus-4-8' },
  );

  expect(callAI).toHaveBeenCalledWith(
    expect.any(Object),
    expect.any(String),
    180,
    null,
    { anthropicModel: 'claude-opus-4-8', purpose: 'Help: parse brainstorm candidate' },
  );
});

test('defaults brainstorming Anthropic calls to the stronger configured default', async () => {
  callAI.mockResolvedValue(JSON.stringify({ solution: 'Ask for one concrete next step' }));

  await parseBrainstormSolution(
    'I am stuck on a decision',
    'If a friend had this problem, what would you tell them?',
    'Ask someone experienced what one thing to try next.',
    { aiProvider: 'anthropic', anthropicApiKey: 'sk-test' },
  );

  expect(callAI).toHaveBeenCalledWith(
    expect.any(Object),
    expect.any(String),
    180,
    null,
    {
      anthropicModel: DEFAULT_BRAINSTORM_ANTHROPIC_MODEL,
      purpose: 'Help: parse brainstorm candidate',
    },
  );
});

test('uses the brainstorming default when the configured model is blank', async () => {
  callAI.mockResolvedValue(JSON.stringify({ solution: 'Ask for one concrete next step' }));

  await parseBrainstormSolution(
    'I am stuck on a decision',
    'If a friend had this problem, what would you tell them?',
    'Ask someone experienced what one thing to try next.',
    { aiProvider: 'anthropic', anthropicApiKey: 'sk-test', brainstormAnthropicModel: '   ' },
  );

  expect(callAI).toHaveBeenCalledWith(
    expect.any(Object),
    expect.any(String),
    180,
    null,
    {
      anthropicModel: DEFAULT_BRAINSTORM_ANTHROPIC_MODEL,
      purpose: 'Help: parse brainstorm candidate',
    },
  );
});

test('falls back to a concise phrase when AI parsing fails', async () => {
  callAI.mockRejectedValue(new Error('offline'));

  const solution = await parseBrainstormSolution(
    'I am stuck',
    'What helped before?',
    '  Try a quick walk and write down the next action.  ',
    { aiProvider: 'ollama' },
  );

  expect(solution).toBe('Try a quick walk and write down the next action');
});

test('fallback trims and caps long answers', () => {
  expect(conciseFallback('x'.repeat(200))).toHaveLength(140);
});
