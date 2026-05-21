'use strict';

const { setRequestUrlMock } = require('obsidian');
const { createEditor, createPlugin } = require('./helpers');

describe('problem-solve log command', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-20T12:00:00-07:00'));
    setRequestUrlMock(async () => ({
      status: 200,
      json: {
        content: [{
          text: JSON.stringify({
            problem: 'Sleepy',
            solutions: ['chewing gum'],
            instanceDetail: 'chewing gum helped with sleepy',
            confidence: 0.95,
          }),
        }],
      },
      text: '',
    }));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('creates a proposal in a new problem file from a selected log line', async () => {
    const editor = createEditor(
      ['chewing gum helped with sleepy'],
      0,
      0,
      { text: 'chewing gum helped with sleepy', from: { line: 0, ch: 0 }, to: { line: 0, ch: 30 } },
    );
    const { log, adapterFiles, workspaceCalls } = await createPlugin([], { anthropicApiKey: 'test-key' });

    const result = await log(editor);

    expect(result.status).toBe('proposed');
    expect(result.path).toBe('Problems/Sleepy.md');
    expect(adapterFiles.get('Problems/Sleepy.md')).toBe([
      '> [!success] Proposed addition',
      '> ```markdown',
      '> - Sleepy',
      '> \t- chewing gum',
      '> \t\t- [[2026/05/2026-05-20-Wednesday|2026-05-20-Wednesday]]',
      '> \t\t\t- chewing gum helped with sleepy',
      '> ```',
      '',
    ].join('\n'));
    expect(workspaceCalls.openLinkText).toEqual([
      { linktext: 'Problems/Sleepy', sourcePath: '', newLeaf: false, openState: undefined },
    ]);
  });

  test('appends a proposal for an existing solution without rewriting prior entries', async () => {
    const existing = [
      '- Sleepy',
      '\t- chewing gum',
      '\t\t- [[2026/05/2026-05-19-Tuesday|2026-05-19-Tuesday]]',
      '\t\t\t- gum helped yesterday',
      '\t- cold shower',
      '\t\t- [[2026/05/2026-05-18-Monday|2026-05-18-Monday]]',
      '\t\t\t- shower helped',
      '',
    ].join('\n');
    const sleepyPage = {
      basename: 'Sleepy',
      path: 'Problems/Sleepy.md',
      frontmatter: {},
      content: existing,
    };
    const editor = createEditor(['chewing gum worked for sleepy'], 0, 0);
    setRequestUrlMock(async () => ({
      status: 200,
      json: {
        content: [{
          text: JSON.stringify({
            problem: 'Sleepy',
            solutions: ['chewing gum'],
            instanceDetail: 'chewing gum worked for sleepy',
            confidence: 0.95,
          }),
        }],
      },
      text: '',
    }));
    const { log, adapterFiles } = await createPlugin([sleepyPage], { anthropicApiKey: 'test-key' });

    const result = await log(editor);

    expect(result.status).toBe('proposed');
    expect(adapterFiles.get('Problems/Sleepy.md')).toBe([
      '- Sleepy',
      '\t- chewing gum',
      '\t\t- [[2026/05/2026-05-19-Tuesday|2026-05-19-Tuesday]]',
      '\t\t\t- gum helped yesterday',
      '\t- cold shower',
      '\t\t- [[2026/05/2026-05-18-Monday|2026-05-18-Monday]]',
      '\t\t\t- shower helped',
      '',
      '> [!success] Proposed addition',
      '> ```markdown',
      '> \t\t- [[2026/05/2026-05-20-Wednesday|2026-05-20-Wednesday]]',
      '> \t\t\t- chewing gum worked for sleepy',
      '> ```',
      '',
    ].join('\n'));
  });

  test('logs narrative input like "I drank caffeine and I felt less tired"', async () => {
    const editor = createEditor(['\t\t- I drank caffeine and I felt less tired'], 0, 0);
    setRequestUrlMock(async () => ({
      status: 200,
      json: {
        content: [{
          text: JSON.stringify({
            problem: 'Tired',
            solutions: ['drank caffeine'],
            instanceDetail: 'I drank caffeine and I felt less tired',
            confidence: 0.95,
          }),
        }],
      },
      text: '',
    }));
    const { log, adapterFiles } = await createPlugin([], { anthropicApiKey: 'test-key' });

    const result = await log(editor);

    expect(result.status).toBe('proposed');
    expect(result.problem).toBe('Tired');
    expect(result.solutions).toEqual(['drank caffeine']);
    expect(adapterFiles.get('Problems/Tired.md')).toBe([
      '> [!success] Proposed addition',
      '> ```markdown',
      '> - Tired',
      '> \t- drank caffeine',
      '> \t\t- [[2026/05/2026-05-20-Wednesday|2026-05-20-Wednesday]]',
      '> \t\t\t- I drank caffeine and I felt less tired',
      '> ```',
      '',
    ].join('\n'));
  });

  test('logs "Tired solved by caffeine" instance from the Obsidian scenario', async () => {
    jest.setSystemTime(new Date('2026-02-19T12:00:00-08:00'));
    setRequestUrlMock(async () => ({
      status: 200,
      json: {
        content: [{
          text: JSON.stringify({
            problem: 'Tired',
            solutions: ['Caffeine'],
            instanceDetail: 'I drank caffeine and it riled me up.',
            confidence: 0.95,
          }),
        }],
      },
      text: '',
    }));
    const tiredPage = {
      basename: 'Tired',
      path: 'Problems/Tired.md',
      frontmatter: {},
      content: [
        '- Tired',
        '\t- Caffeine',
        '',
      ].join('\n'),
    };
    const editor = createEditor(['I drank caffeine and it riled me up.'], 0, 0);
    const { log, adapterFiles } = await createPlugin([tiredPage], { anthropicApiKey: 'test-key' });

    const result = await log(editor);

    expect(result.status).toBe('proposed');
    expect(result.problem).toBe('Tired');
    expect(result.solutions).toEqual(['Caffeine']);
    expect(adapterFiles.get('Problems/Tired.md')).toBe([
      '- Tired',
      '\t- Caffeine',
      '',
      '> [!success] Proposed addition',
      '> ```markdown',
      '> \t\t- [[2026/02/2026-02-19-Thursday|2026-02-19-Thursday]]',
      '> \t\t\t- I drank caffeine and it riled me up.',
      '> ```',
      '',
    ].join('\n'));
  });
});
