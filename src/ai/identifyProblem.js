'use strict';

/**
 * ai/identifyProblem.js
 *
 * Pure function: given a user's thought/utterance and the list of existing
 * problem names, asks Claude to identify which problems it relates to (matching
 * existing ones or naming new ones).
 *
 * Returns a plain result object — no side effects, no vault writes, no UI.
 */

const { callAI, extractJsonObject } = require('./client');

const CONFIDENCE_THRESHOLD = 0.5;

/**
 * @param {string} utterance     - The user's thought text
 * @param {string[]} existingNames - Basenames of all files in Problems/
 * @param {object} settings
 * @returns {Promise<{
 *   status: 'matched' | 'unidentified' | 'no-api-key' | 'empty' | 'error',
 *   problems?: Array<{ problemName: string, isNew: boolean, confidence: number }>,
 *   message?: string,
 * }>}
 */
async function identifyProblem(utterance, existingNames, settings, collector = null) {
  if (!utterance.trim()) return { status: 'empty' };
  if (settings?.aiProvider === 'anthropic' && !settings?.anthropicApiKey) return { status: 'no-api-key' };

  const prompt = [
    'You are helping the user identify which learning problems their thought relates to.',
    'A thought may touch on several distinct problems — identify each one.',
    'Return ONLY raw JSON with this shape:',
    '{"problems":[{"problemName":"Problem Name","matchedExisting":true,"confidence":0.9}]}',
    '',
    'Rules:',
    '- Return one entry per distinct problem, ordered most-relevant first.',
    '- problemName should be concise, title-cased, and suitable as an Obsidian filename.',
    '- matchedExisting: true if it clearly maps to one of the existing names below.',
    '- confidence: 0.0–1.0. Use < 0.5 for entries that are unclear.',
    '- If matchedExisting is true, use the exact existing name.',
    '- Return an empty array if no problem is identifiable.',
    '',
    `Existing problem names: ${JSON.stringify(existingNames)}`,
    `User thought: ${JSON.stringify(utterance)}`,
  ].join('\n');

  try {
    const text = await callAI(settings, prompt, 512, collector, {
      purpose: 'Identify problems',
    });
    const parsed = extractJsonObject(text);

    const raw = Array.isArray(parsed.problems) ? parsed.problems : [];
    const problems = raw
      .map(entry => {
        const confidence = Number(entry?.confidence ?? 0);
        if (!entry?.problemName || confidence < CONFIDENCE_THRESHOLD) return null;
        const problemName = resolveMatchedName(entry.problemName, existingNames);
        const isNew = !existingNames.some(n => normalize(n) === normalize(problemName));
        return { problemName, isNew, confidence };
      })
      .filter(Boolean)
      // Drop duplicates that resolve to the same problem, keeping the first (highest-ranked).
      .filter((p, i, arr) => arr.findIndex(o => normalize(o.problemName) === normalize(p.problemName)) === i);

    if (problems.length === 0) return { status: 'unidentified' };

    return { status: 'matched', problems };
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
