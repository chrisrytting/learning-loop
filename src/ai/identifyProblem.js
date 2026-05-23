'use strict';

/**
 * ai/identifyProblem.js
 *
 * Pure function: given a user's thought/utterance and the list of existing
 * problem names, asks Claude to identify which problem it relates to (or name a new one).
 *
 * Returns a plain result object — no side effects, no vault writes, no UI.
 */

const { callClaude, extractJsonObject } = require('./client');

/**
 * @param {string} utterance     - The user's thought text
 * @param {string[]} existingNames - Basenames of all files in Problems/
 * @param {string} apiKey
 * @returns {Promise<{
 *   status: 'matched' | 'unidentified' | 'no-api-key' | 'empty' | 'error',
 *   problemName?: string,
 *   isNew?: boolean,
 *   confidence?: number,
 *   message?: string,
 * }>}
 */
async function identifyProblem(utterance, existingNames, apiKey) {
  if (!utterance.trim()) return { status: 'empty' };
  if (!apiKey) return { status: 'no-api-key' };

  const prompt = [
    'You are helping the user identify which learning problem their thought relates to.',
    'Return ONLY raw JSON with this shape:',
    '{"problemName":"Problem Name","matchedExisting":true,"confidence":0.9}',
    '',
    'Rules:',
    '- problemName should be concise, title-cased, and suitable as an Obsidian filename.',
    '- matchedExisting: true if it clearly maps to one of the existing names below.',
    '- confidence: 0.0–1.0. Return < 0.5 if the problem is unclear.',
    '- If matchedExisting is true, use the exact existing name.',
    '',
    `Existing problem names: ${JSON.stringify(existingNames)}`,
    `User thought: ${JSON.stringify(utterance)}`,
  ].join('\n');

  try {
    const text = await callClaude(apiKey, prompt, 256);
    const parsed = extractJsonObject(text);

    const confidence = Number(parsed.confidence ?? 0);
    if (!parsed.problemName || confidence < 0.5) {
      return { status: 'unidentified', confidence };
    }

    const problemName = resolveMatchedName(parsed.problemName, existingNames);
    const isNew = !existingNames.some(n => normalize(n) === normalize(problemName));

    return { status: 'matched', problemName, isNew, confidence };
  } catch (error) {
    return { status: 'error', message: error.message };
  }
}

function normalize(name) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function resolveMatchedName(aiName, existingNames) {
  const normalized = normalize(aiName);
  const exact = existingNames.find(n => normalize(n) === normalized);
  return exact ?? titleCase(aiName);
}

function titleCase(str) {
  return str.trim().replace(/\s+/g, ' ').split(' ').filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

module.exports = { identifyProblem };
