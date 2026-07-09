'use strict';

const {
  BRAINSTORM_QUESTIONS_PATH,
  DEFAULT_BRAINSTORM_QUESTIONS,
  buildQuestionsMarkdown,
  ensureBrainstormQuestionsPage,
  parseQuestionMarkdown,
  readBrainstormQuestions,
} = require('./brainstormQuestions');

function makeApp(initial = new Map()) {
  const files = new Map(initial);
  const dirs = new Set();
  return {
    files,
    dirs,
    app: {
      vault: {
        adapter: {
          exists: async path => dirs.has(path) || files.has(path),
          mkdir: async path => { dirs.add(path); },
          read: async path => files.get(path),
          write: async (path, content) => { files.set(path, content); },
        },
      },
    },
  };
}

test('creates the editable brainstorming questions page', async () => {
  const { app, files, dirs } = makeApp();

  await ensureBrainstormQuestionsPage(app);

  expect(dirs.has('Learning Loop Instructions')).toBe(true);
  expect(files.get(BRAINSTORM_QUESTIONS_PATH)).toContain('# Help Brainstorming Questions');
  expect(files.get(BRAINSTORM_QUESTIONS_PATH)).toContain(DEFAULT_BRAINSTORM_QUESTIONS[0]);
});

test('reads user-edited markdown bullet questions', async () => {
  const content = buildQuestionsMarkdown(['First?', 'Second?']);
  const { app } = makeApp(new Map([[BRAINSTORM_QUESTIONS_PATH, content]]));

  await expect(readBrainstormQuestions(app)).resolves.toEqual(['First?', 'Second?']);
});

test('parses only markdown bullets as questions', () => {
  expect(parseQuestionMarkdown('# Title\n\n- Keep this?\nParagraph\n* Also this?')).toEqual([
    'Keep this?',
    'Also this?',
  ]);
});
