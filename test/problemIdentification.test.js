'use strict';

const { setQueryForTests } = require('../src/anthropicAgent');
const { createEditor, createPlugin } = require('./helpers');
const {
  identifyProblem,
  listProblemNames,
  buildNewProblemFile,
} = require('../src/problemIdentification');

function createMockApp(files) {
  return {
    vault: {
      getFiles: () => files.map((f) => ({
        extension: 'md',
        basename: f.basename,
        path: f.path || `Problems/${f.basename}.md`,
      })),
      adapter: {
        exists: async () => true,
        mkdir: async () => {},
        write: async () => {},
      },
    },
    metadataCache: {
      getFileCache: () => null,
    },
  };
}

function mockAgentResponse(structuredOutput) {
  setQueryForTests(async function* mockQuery() {
    yield {
      type: 'result',
      subtype: 'success',
      structured_output: structuredOutput,
      result: JSON.stringify(structuredOutput),
    };
  });
}

describe('problem identification', () => {
  afterEach(() => {
    setQueryForTests(null);
  });

  test('lists Problems page names from the vault', () => {
    const app = createMockApp([
      { basename: 'Stress', path: 'Problems/Stress.md' },
      { basename: 'Anxiety', path: 'Problems/Anxiety.md' },
    ]);

    expect(listProblemNames(app)).toEqual(['Stress', 'Anxiety']);
  });

  test('matches an existing Problems page via the agent', async () => {
    mockAgentResponse({
      problemName: 'Stress',
      matchedExisting: true,
      confidence: 0.95,
    });

    const app = createMockApp([
      { basename: 'Stress', path: 'Problems/Stress.md' },
    ]);

    const result = await identifyProblem(
      'I feel like I get stressed when I am confused about what I am trying to do',
      { app, apiKey: 'test-key' },
    );

    expect(result).toEqual({
      status: 'matched',
      problemName: 'Stress',
      isNew: false,
      method: 'ai',
    });
  });

  test('creates a new problem label when the agent finds no existing match', async () => {
    mockAgentResponse({
      problemName: 'Stress',
      matchedExisting: false,
      confidence: 0.92,
    });

    const app = createMockApp([]);
    const result = await identifyProblem(
      'I feel like I get stressed when I am confused about what I am trying to do',
      { app, apiKey: 'test-key' },
    );

    expect(result).toEqual({
      status: 'matched',
      problemName: 'Stress',
      isNew: true,
      method: 'ai',
    });
  });

  test('returns no-api-key when the API key is missing', async () => {
    const app = createMockApp([]);
    const result = await identifyProblem('I feel stressed', { app, apiKey: '' });
    expect(result).toEqual({ status: 'no-api-key' });
  });

  test('creates a new problem page and links it when help wraps an utterance', async () => {
    mockAgentResponse({
      problemName: 'Stress',
      matchedExisting: false,
      confidence: 0.92,
    });

    const editor = createEditor([
      'I feel like I get stressed when I am confused about what I am trying to do',
    ], 0, 0);
    const { help, adapterFiles } = await createPlugin([], { anthropicApiKey: 'test-key' });

    await help(editor);

    const doc = editor._doc;
    expect(doc[0]).toBe('- [[Learning Loop Trace]] %% fold %%');
    expect(doc[1]).toBe('\t- User Thought / Feeling');
    expect(doc[2]).toBe('\t\t- I feel like I get stressed when I am confused about what I am trying to do');
    expect(doc[3]).toBe('\t\t- [[Stress]]');
    expect(doc[4]).toBe('\t- User Response');
    expect(adapterFiles.get('Problems/Stress.md')).toBe(buildNewProblemFile('Stress'));
  });

  test('links an existing Problems page without creating a new file', async () => {
    mockAgentResponse({
      problemName: 'Stress',
      matchedExisting: true,
      confidence: 0.95,
    });

    const stressPage = {
      basename: 'Stress',
      path: 'Problems/Stress.md',
      content: '- Stress\n',
    };
    const editor = createEditor([
      'I feel like I get stressed when I am confused about what I am trying to do',
    ], 0, 0);
    const { help, adapterFiles } = await createPlugin([stressPage], { anthropicApiKey: 'test-key' });

    await help(editor);

    expect(editor._doc[3]).toBe('\t\t- [[Stress]]');
    expect(adapterFiles.get('Problems/Stress.md')).toBe('- Stress\n');
  });
});
