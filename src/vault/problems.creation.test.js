'use strict';

const { ensureProblemPage, parseProblemSummary, writeProblemLog } = require('./problems');

function makeApp() {
  const state = { files: new Map() };
  const adapter = {
    exists: async path => path === 'Problems' || state.files.has(path),
    mkdir: async () => {},
    read: async path => state.files.get(path),
    write: async (path, content) => { state.files.set(path, content); },
  };
  const app = {
    vault: {
      adapter,
      getFiles: () => [],
    },
  };
  return { app, state };
}

describe('problem page creation', () => {
  test('a logged problem uses Solutions as the parent block', async () => {
    const { app, state } = makeApp();

    await writeProblemLog(app, {
      problem: 'unmotivated',
      solutions: ['Body Scan', 'Visualization'],
      instanceLink: '[[2026/07/2026-07-08-Wednesday#^fomo12|2026-07-08-Wednesday]]',
    });

    const content = state.files.get('Problems/Unmotivated.md');
    expect(content).toMatch(/^- Solutions\n/);
    expect(content).not.toContain('- Unmotivated\n');
    expect(content).toContain('\t- Body Scan\n');
    expect(content).toContain('\t- Visualization\n');
    expect(content).not.toContain("I'm feeling unmotivated");
    expect(content).toContain(
      '- Instances\n\t- [[2026-07-08-Wednesday]]\n'
      + '\t\t- ![[2026/07/2026-07-08-Wednesday#^fomo12]]\n'
    );
  });

  test('an empty problem page uses Solutions as the parent block', async () => {
    const { app, state } = makeApp();

    await ensureProblemPage(app, 'unmotivated');

    expect(state.files.get('Problems/Unmotivated.md')).toBe([
      '---',
      'tags:',
      '  - unmotivated',
      '---',
      '',
      '- Solutions',
      '',
      '- Instances',
      '',
    ].join('\n'));
  });

  test('a problem can be logged without inventing a solution', async () => {
    const { app, state } = makeApp();

    await writeProblemLog(app, {
      problem: 'fomo',
      solutions: [],
      instanceLink: '[[Daily#^abc123|Daily]]',
    });

    expect(state.files.get('Problems/Fomo.md')).toBe([
      '- Solutions',
      '- Instances',
      '\t- [[Daily]]',
      '\t\t- ![[Daily#^abc123]]',
      '',
    ].join('\n'));
  });

  test('instance references are not read back as solutions', () => {
    const content = [
      '- Solutions',
      '\t- Remember 4000 Weeks',
      '- Instances',
      '\t- [[Daily#^abc123|Daily]]',
    ].join('\n');

    expect(parseProblemSummary(content)).toEqual([
      { text: 'Remember 4000 Weeks', instances: [] },
    ]);
  });

  test('logging the same instance upgrades the old one-line form', async () => {
    const { app, state } = makeApp();
    state.files.set('Problems/Fomo.md', [
      '- Solutions',
      '- Instances',
      '\t- [[Daily#^abc123|Daily]]',
      '',
    ].join('\n'));

    await writeProblemLog(app, {
      problem: 'fomo',
      solutions: [],
      instanceLink: '[[Daily#^abc123|Daily]]',
    });

    expect(state.files.get('Problems/Fomo.md')).toContain(
      '\t- [[Daily]]\n\t\t- ![[Daily#^abc123]]\n'
    );
  });
});
