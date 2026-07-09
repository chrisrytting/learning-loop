'use strict';

const BRAINSTORM_QUESTIONS_PATH = 'Learning Loop Instructions/Help Brainstorming Questions.md';
const BRAINSTORM_QUESTIONS_DIR = 'Learning Loop Instructions';

const DEFAULT_BRAINSTORM_QUESTIONS = [
  "when you think of this problem, what are some related books you've read that come to mind that might have useful advice on what to try doing or how to see this problem that you could try out right now?",
  'what advice would your parents give you on this problem?',
  'If you had a friend who was facing this problem, what advice would you give them?',
  "What's the time in the past that you faced this problem? And what did you do to make it better then?",
];

async function readBrainstormQuestions(app) {
  await ensureBrainstormQuestionsPage(app);
  const content = await app.vault.adapter.read(BRAINSTORM_QUESTIONS_PATH);
  const questions = parseQuestionMarkdown(content);
  return questions.length > 0 ? questions : DEFAULT_BRAINSTORM_QUESTIONS.slice();
}

async function ensureBrainstormQuestionsPage(app) {
  const adapter = app.vault.adapter;
  if (!(await adapter.exists(BRAINSTORM_QUESTIONS_DIR))) await adapter.mkdir(BRAINSTORM_QUESTIONS_DIR);
  if (await adapter.exists(BRAINSTORM_QUESTIONS_PATH)) return;
  await adapter.write(BRAINSTORM_QUESTIONS_PATH, buildQuestionsMarkdown(DEFAULT_BRAINSTORM_QUESTIONS));
}

function parseQuestionMarkdown(content) {
  const questions = [];
  for (const line of String(content || '').split('\n')) {
    const match = line.match(/^\s*[-*]\s+(.+?)\s*$/);
    if (match && match[1].trim()) questions.push(match[1].trim());
  }
  return questions;
}

function buildQuestionsMarkdown(questions) {
  return [
    '# Help Brainstorming Questions',
    '',
    'Edit this list to change the questions Learning Loop samples when Help cannot find a solution to try.',
    '',
    ...questions.map(question => `- ${question}`),
    '',
  ].join('\n');
}

function sampleQuestion(questions, previousQuestion = '') {
  const available = questions.filter(question => question && question !== previousQuestion);
  const pool = available.length > 0 ? available : questions;
  if (pool.length === 0) return '';
  return pool[Math.floor(Math.random() * pool.length)];
}

module.exports = {
  BRAINSTORM_QUESTIONS_PATH,
  DEFAULT_BRAINSTORM_QUESTIONS,
  readBrainstormQuestions,
  ensureBrainstormQuestionsPage,
  parseQuestionMarkdown,
  buildQuestionsMarkdown,
  sampleQuestion,
};
