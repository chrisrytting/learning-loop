'use strict';

/**
 * ai/parseLogEntry.js
 *
 * Pure function: given a raw text input and the list of existing problem files,
 * asks the AI to extract an editable new problem name, ranked existing problem
 * candidates, solutions, and the original instance detail.
 *
 * No side effects, no vault writes, no UI.
 */

const { callAI, extractJsonObject } = require('./client');

/**
 * @param {string} input           - Raw text from the editor (selection or current line)
 * @param {Array<{file: string, solutions: string[]}>} problemFiles
 * @param {object} settings
 * @returns {Promise<{
 *   problem: string,
 *   problemCandidates: Array<{name: string, confidence: number}>,
 *   solutions: string[],
 *   instanceDetail: string,
 *   confidence: number,
 * }>}
 */
async function parseLogEntry(input, problemFiles, settings, collector = null) {
  const instanceDetail = stripListMarker(input);

  if (settings?.aiProvider === 'anthropic' && !settings?.anthropicApiKey) {
    return { problem: '', problemCandidates: [], solutions: [], instanceDetail, confidence: 0 };
  }

  const prompt = [
    'Extract a problem-solution log entry from the user input.',
    'Return ONLY raw JSON with this shape:',
    '{"newProblem":"New Problem Name","existingProblemCandidates":[{"name":"Exact Existing Filename","confidence":0.9}],"solutions":["solution phrase"],"instanceDetail":"exact user wording without markdown bullet","confidence":0.9}',
    '',
    'Rules:',
    '- Use semantic interpretation, not keyword matching.',
    '- Preserve instanceDetail exactly, except strip leading whitespace and list markers.',
    '- newProblem should be a concise, title-cased name for a new page, even when an existing page may match.',
    '- solutions should be concise action phrases without a leading subject like "I".',
    '- Rank up to 3 semantically relevant existing problem pages in existingProblemCandidates.',
    '- Candidate names MUST exactly match names from the supplied existing problem files.',
    '- Prefer broad conceptual matches, not just literal wording (for example, feeling left out may relate to FOMO).',
    '- Omit weak existing candidates rather than inventing candidate names.',
    '- If problem or solution is unclear, use empty string/array and confidence < 0.5.',
    '',
    `Existing problem files and solutions: ${JSON.stringify(problemFiles)}`,
    `User input: ${JSON.stringify(instanceDetail)}`,
  ].join('\n');

  try {
    const text = await callAI(settings, prompt, 400, collector, {
      purpose: 'Log: parse problem and solutions',
    });
    const parsed = extractJsonObject(text);
    const problem = typeof (parsed.newProblem ?? parsed.problem) === 'string'
      ? titleCase(parsed.newProblem ?? parsed.problem)
      : '';
    return {
      problem,
      problemCandidates: normalizeExistingCandidates(
        parsed.existingProblemCandidates,
        problemFiles.map(entry => entry.file),
      ),
      solutions: Array.isArray(parsed.solutions)
        ? parsed.solutions.filter(s => typeof s === 'string' && s.trim()).map(s => s.trim())
        : [],
      instanceDetail: typeof parsed.instanceDetail === 'string' && parsed.instanceDetail.trim()
        ? parsed.instanceDetail.trim()
        : instanceDetail,
      confidence: Number(parsed.confidence ?? 0),
    };
  } catch {
    return { problem: '', problemCandidates: [], solutions: [], instanceDetail, confidence: 0 };
  }
}

function normalizeExistingCandidates(candidates, existingNames) {
  if (!Array.isArray(candidates)) return [];
  const canonicalNames = new Map(existingNames.map(name => [normalize(name), name]));
  const seen = new Set();
  const normalized = [];
  for (const candidate of candidates) {
    if (!candidate || typeof candidate.name !== 'string') continue;
    const canonical = canonicalNames.get(normalize(candidate.name));
    if (!canonical || seen.has(canonical)) continue;
    seen.add(canonical);
    normalized.push({
      name: canonical,
      confidence: Math.max(0, Math.min(1, Number(candidate.confidence) || 0)),
    });
  }
  return normalized.sort((a, b) => b.confidence - a.confidence).slice(0, 3);
}

function stripListMarker(text) {
  return text.replace(/^[\s\t]*[-*]?\s*/, '').trim();
}

function titleCase(str) {
  return str.trim().replace(/\s+/g, ' ').split(' ').filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function normalize(str) {
  return str.toLowerCase().replace(/[^a-z0-9]/g, '');
}

module.exports = { parseLogEntry, normalizeExistingCandidates };
