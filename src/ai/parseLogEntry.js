'use strict';

/**
 * ai/parseLogEntry.js
 *
 * Pure function: given a raw text input and the list of existing problem files,
 * asks Claude to extract a structured { problem, solutions, instanceDetail, confidence }.
 *
 * No side effects, no vault writes, no UI.
 */

const { callClaude, extractJsonObject } = require('./client');

/**
 * @param {string} input           - Raw text from the editor (selection or current line)
 * @param {Array<{file: string, solutions: string[]}>} problemFiles
 * @param {string} apiKey
 * @returns {Promise<{
 *   problem: string,
 *   solutions: string[],
 *   instanceDetail: string,
 *   confidence: number,
 * }>}
 */
async function parseLogEntry(input, problemFiles, apiKey) {
  const instanceDetail = stripListMarker(input);

  if (!apiKey) {
    return { problem: '', solutions: [], instanceDetail, confidence: 0 };
  }

  const prompt = [
    'Extract a problem-solution log entry from the user input.',
    'Return ONLY raw JSON with this shape:',
    '{"problem":"Problem Name","solutions":["solution phrase"],"instanceDetail":"exact user wording without markdown bullet","confidence":0.9}',
    '',
    'Rules:',
    '- Use semantic interpretation, not keyword matching.',
    '- Preserve instanceDetail exactly, except strip leading whitespace and list markers.',
    '- problem should be the difficulty or symptom, title-cased, suitable as an Obsidian filename.',
    '- solutions should be concise action phrases without a leading subject like "I".',
    '- If an existing problem file clearly matches, use that file name exactly.',
    '- If problem or solution is unclear, use empty string/array and confidence < 0.5.',
    '',
    `Existing problem files and solutions: ${JSON.stringify(problemFiles)}`,
    `User input: ${JSON.stringify(instanceDetail)}`,
  ].join('\n');

  try {
    const text = await callClaude(apiKey, prompt, 400);
    const parsed = extractJsonObject(text);
    return {
      problem: typeof parsed.problem === 'string' ? titleCase(parsed.problem) : '',
      solutions: Array.isArray(parsed.solutions)
        ? parsed.solutions.filter(s => typeof s === 'string' && s.trim()).map(s => s.trim())
        : [],
      instanceDetail: typeof parsed.instanceDetail === 'string' && parsed.instanceDetail.trim()
        ? parsed.instanceDetail.trim()
        : instanceDetail,
      confidence: Number(parsed.confidence ?? 0),
    };
  } catch {
    return { problem: '', solutions: [], instanceDetail, confidence: 0 };
  }
}

function stripListMarker(text) {
  return text.replace(/^[\s\t]*[-*]?\s*/, '').trim();
}

function titleCase(str) {
  return str.trim().replace(/\s+/g, ' ').split(' ').filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

module.exports = { parseLogEntry };
