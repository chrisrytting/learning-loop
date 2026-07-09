'use strict';

jest.mock('./client', () => ({
  callAI: jest.fn(),
  extractJsonObject: text => JSON.parse(text),
}));

const { callAI } = require('./client');
const { parseBrainstormSolution, conciseFallback } = require('./brainstormSolution');

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
