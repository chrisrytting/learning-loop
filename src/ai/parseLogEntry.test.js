'use strict';

jest.mock('./client', () => ({
  callAI: jest.fn(),
  extractJsonObject: text => JSON.parse(text),
}));

const { callAI } = require('./client');
const { parseLogEntry, normalizeExistingCandidates } = require('./parseLogEntry');

test('validates, canonicalizes, deduplicates, and ranks existing candidates', () => {
  expect(normalizeExistingCandidates([
    { name: 'fomo', confidence: 0.9 },
    { name: 'Not Real', confidence: 1 },
    { name: 'Loneliness', confidence: 0.6 },
    { name: 'FOMO', confidence: 0.4 },
  ], ['FOMO', 'Loneliness'])).toEqual([
    { name: 'FOMO', confidence: 0.9 },
    { name: 'Loneliness', confidence: 0.6 },
  ]);
});

test('returns an editable new problem first plus validated existing matches', async () => {
  callAI.mockResolvedValue(JSON.stringify({
    newProblem: 'left out',
    existingProblemCandidates: [{ name: 'FOMO', confidence: 0.88 }],
    solutions: [],
    instanceDetail: "I'm feeling left out",
    confidence: 0.9,
  }));

  const result = await parseLogEntry(
    "- I'm feeling left out",
    [{ file: 'FOMO', solutions: [] }],
    { aiProvider: 'ollama' },
  );

  expect(result.problem).toBe('Left Out');
  expect(result.problemCandidates).toEqual([{ name: 'FOMO', confidence: 0.88 }]);
});
