'use strict';

const { parseProblemDetailed, ensureSolutionBlockId } = require('./problems');

const SAMPLE = [
  '---',
  'tags:',
  '  - stress',
  '---',
  '- Stress',
  '\t- Take a walk',
  '\t\t- [[2026/05/12-Tuesday|2026-05-12-Tuesday]]',
  '\t\t\t- felt better',
  '\t- Breathe ^abc123',
].join('\n');

function makeApp(content) {
  const state = { content };
  const file = { extension: 'md', basename: 'Stress', path: 'Problems/Stress.md' };
  const app = {
    vault: {
      getFiles: () => [file],
      adapter: {
        read: async () => state.content,
        write: async (_p, c) => { state.content = c; },
      },
    },
  };
  return { app, state };
}

describe('parseProblemDetailed', () => {
  test('captures solution line indices, block ids, and instances', () => {
    const sols = parseProblemDetailed(SAMPLE);
    expect(sols).toEqual([
      {
        text: 'Take a walk',
        lineIndex: 5,
        blockId: null,
        instances: [{ date: '2026-05-12-Tuesday', detail: 'felt better' }],
      },
      { text: 'Breathe', lineIndex: 8, blockId: 'abc123', instances: [] },
    ]);
  });
});

describe('ensureSolutionBlockId', () => {
  test('returns the existing block id without rewriting', async () => {
    const { app, state } = makeApp(SAMPLE);
    const id = await ensureSolutionBlockId(app, 'Stress', 'Breathe');
    expect(id).toBe('abc123');
    expect(state.content).toBe(SAMPLE); // unchanged
  });

  test('adds a block id to a solution that lacks one', async () => {
    const { app, state } = makeApp(SAMPLE);
    const id = await ensureSolutionBlockId(app, 'Stress', 'Take a walk');
    expect(id).toMatch(/^[a-z0-9]+$/);
    expect(state.content).toContain(`\t- Take a walk ^${id}`);
    // Re-running returns the same id and doesn't double-append.
    const again = await ensureSolutionBlockId(app, 'Stress', 'Take a walk');
    expect(again).toBe(id);
    expect((state.content.match(/\^/g) || []).length).toBe(2); // abc123 + new one
  });

  test('returns null when the solution is not found', async () => {
    const { app } = makeApp(SAMPLE);
    expect(await ensureSolutionBlockId(app, 'Stress', 'Nonexistent')).toBeNull();
  });
});
