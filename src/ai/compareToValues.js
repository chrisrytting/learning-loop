'use strict';

/**
 * ai/compareToValues.js
 *
 * Pure function: given an action/thought and parsed values, ask Claude for
 * an alignment score and short rationale. No UI or vault side effects.
 */

const { callClaude, extractJsonObject } = require('./client');

/**
 * @param {string} actionText
 * @param {Array<{ name: string, detail: string }>} values
 * @param {string} apiKey
 * @returns {Promise<{
 *   status: 'ok' | 'no-api-key' | 'empty-input' | 'empty-values' | 'error',
 *   alignmentScore?: number,
 *   rationale?: string,
 *   message?: string,
 * }>}
 */
async function compareToValues(actionText, values, apiKey) {
  if (!String(actionText || '').trim()) {
    return { status: 'empty-input' };
  }
  if (!values.length) {
    return { status: 'empty-values' };
  }
  if (!apiKey) {
    return { status: 'no-api-key' };
  }

  const valuesBlock = values.map(v => {
    if (v.detail) return `- ${v.name}: ${v.detail}`;
    return `- ${v.name}`;
  }).join('\n');

  const prompt = [
    'You help someone check how well a planned action or situation aligns with their personal values.',
    'Return ONLY raw JSON with this shape:',
    '{"alignmentScore":0,"rationale":"one or two short sentences"}',
    '',
    'Rules:',
    '- alignmentScore: integer 0–100 (0 = completely misaligned, 100 = strongly aligned).',
    '- rationale: concise, specific to the action and values; no markdown.',
    '- Weigh all listed values together; mention tension if values conflict.',
    '',
    'Values:',
    valuesBlock,
    '',
    `Action / situation to evaluate: ${JSON.stringify(actionText)}`,
  ].join('\n');

  try {
    const text = await callClaude(apiKey, prompt, 300);
    const parsed = extractJsonObject(text);
    const alignmentScore = Math.round(Number(parsed.alignmentScore));
    const rationale = typeof parsed.rationale === 'string' ? parsed.rationale.trim() : '';

    if (Number.isNaN(alignmentScore) || alignmentScore < 0 || alignmentScore > 100) {
      return { status: 'error', message: 'AI returned an invalid alignment score.' };
    }
    if (!rationale) {
      return { status: 'error', message: 'AI returned an empty rationale.' };
    }

    return { status: 'ok', alignmentScore, rationale };
  } catch (error) {
    return { status: 'error', message: error.message };
  }
}

module.exports = { compareToValues };
