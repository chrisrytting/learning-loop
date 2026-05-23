'use strict';

const { identifyProblemWithAgent } = require('./anthropicAgent');

const PROBLEMS_DIR = 'Problems';

function titleCaseProblemName(name) {
  return name
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function normalizeProblemName(name) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function listProblemNames(app) {
  return app.vault.getFiles()
    .filter(file => file.extension === 'md' && file.path.startsWith(`${PROBLEMS_DIR}/`))
    .map(file => file.basename);
}

function buildNewProblemFile(problemName) {
  const tag = problemName.toLowerCase().replace(/\s+/g, '-');
  return [
    '---',
    'tags:',
    `  - ${tag}`,
    '---',
    '',
    `- ${problemName}`,
    '',
  ].join('\n');
}

function resolveMatchedProblemName(problemName, existingNames) {
  const normalized = normalizeProblemName(problemName);
  const exact = existingNames.find(name => normalizeProblemName(name) === normalized);
  return exact || titleCaseProblemName(problemName);
}

async function identifyProblem(utterance, { app, apiKey }) {
  const trimmed = utterance.trim();
  if (!trimmed) return { status: 'empty' };
  if (!apiKey) return { status: 'no-api-key' };

  const existingNames = listProblemNames(app);

  try {
    const aiResult = await identifyProblemWithAgent(trimmed, existingNames, apiKey);
    if (!aiResult.problemName || aiResult.confidence < 0.5) {
      return { status: 'unidentified', confidence: aiResult.confidence };
    }

    if (aiResult.matchedExisting) {
      const problemName = resolveMatchedProblemName(aiResult.problemName, existingNames);
      const isKnown = existingNames.some(name => normalizeProblemName(name) === normalizeProblemName(problemName));
      if (!isKnown) {
        return {
          status: 'unidentified',
          confidence: aiResult.confidence,
          reason: `Agent matched existing page "${aiResult.problemName}" but it was not found in Problems/`,
        };
      }
      return {
        status: 'matched',
        problemName,
        isNew: false,
        method: 'ai',
      };
    }

    const problemName = resolveMatchedProblemName(aiResult.problemName, existingNames);
    const isNew = !existingNames.some(name => normalizeProblemName(name) === normalizeProblemName(problemName));
    return {
      status: 'matched',
      problemName,
      isNew,
      method: 'ai',
    };
  } catch (error) {
    return { status: 'error', message: error.message };
  }
}

async function ensureProblemPage(app, problemName) {
  const adapter = app.vault.adapter;
  if (!await adapter.exists(PROBLEMS_DIR)) await adapter.mkdir(PROBLEMS_DIR);

  const normalized = normalizeProblemName(problemName);
  const files = app.vault.getFiles()
    .filter(file => file.extension === 'md' && file.path.startsWith(`${PROBLEMS_DIR}/`));
  const existing = files.find(file => normalizeProblemName(file.basename) === normalized);
  if (existing) return { path: existing.path, problemName: existing.basename, created: false };

  const title = titleCaseProblemName(problemName);
  const path = `${PROBLEMS_DIR}/${title}.md`;
  await adapter.write(path, buildNewProblemFile(title));
  return { path, problemName: title, created: true };
}

module.exports = {
  PROBLEMS_DIR,
  titleCaseProblemName,
  normalizeProblemName,
  listProblemNames,
  identifyProblem,
  ensureProblemPage,
  buildNewProblemFile,
};
