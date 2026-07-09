'use strict';

const { appendEvidenceToSolution } = require('./problems');

function makeApp(initialContent) {
  const path = 'Problems/Unmotivated.md';
  const state = { files: new Map([[path, initialContent]]) };
  const app = {
    vault: {
      adapter: {
        read: async p => state.files.get(p),
        write: async (p, content) => { state.files.set(p, content); },
      },
      getFiles: () => [{ extension: 'md', basename: 'Unmotivated', path }],
    },
  };
  return { app, state, path };
}

describe('appendEvidenceToSolution', () => {
  test('inserts under the solution, not into a later Instances section', async () => {
    const { app, state, path } = makeApp([
      '- Solutions',
      '',
      '\t- Body Scan ^sol1',
      '',
      '- Instances',
      '\t- [[Daily]]',
      '\t\t- ![[Daily#^abc]]',
      '',
    ].join('\n'));

    const ok = await appendEvidenceToSolution(
      app, 'Unmotivated', 'sol1', ['\t\t- [[Report]] ![[Report#^xyz]]'],
    );

    expect(ok).toBe(true);
    const lines = state.files.get(path).split('\n');
    expect(lines[2]).toBe('\t- Body Scan ^sol1');
    expect(lines[3]).toBe('\t\t- [[Report]] ![[Report#^xyz]]');
    // Instances section is untouched.
    expect(state.files.get(path)).toContain(
      '- Instances\n\t- [[Daily]]\n\t\t- ![[Daily#^abc]]',
    );
  });

  test('newest report lands above older reports on the same solution', async () => {
    const { app, path } = makeApp([
      '- Solutions',
      '',
      '\t- Body Scan ^sol1',
      '\t\t- [[OldReport]] ![[OldReport#^old]]',
      '',
      '- Instances',
      '',
    ].join('\n'));

    await appendEvidenceToSolution(
      app, 'Unmotivated', 'sol1', ['\t\t- [[NewReport]] ![[NewReport#^new]]'],
    );

    const lines = app.vault.adapter.read(path);
    const content = await lines;
    const solIndex = content.split('\n').indexOf('\t- Body Scan ^sol1');
    const newIndex = content.split('\n').indexOf('\t\t- [[NewReport]] ![[NewReport#^new]]');
    const oldIndex = content.split('\n').indexOf('\t\t- [[OldReport]] ![[OldReport#^old]]');

    expect(newIndex).toBe(solIndex + 1);
    expect(newIndex).toBeLessThan(oldIndex);
  });

  test('returns false when the solution block id is not found', async () => {
    const { app } = makeApp('- Solutions\n\t- Body Scan ^sol1\n');
    const ok = await appendEvidenceToSolution(app, 'Unmotivated', 'missing', ['\t\t- x']);
    expect(ok).toBe(false);
  });
});
