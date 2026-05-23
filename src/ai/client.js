'use strict';

/**
 * ai/client.js
 *
 * Single place for all Anthropic API calls.
 * Every other module that needs AI goes through callClaude() — never calls requestUrl directly.
 */

const { requestUrl } = require('obsidian');

const ANTHROPIC_MODEL = 'claude-haiku-4-5-20251001';

/**
 * Call the Claude API with a plain string prompt.
 * Returns the raw text response.
 *
 * @param {string} apiKey
 * @param {string} prompt
 * @param {number} maxTokens
 * @returns {Promise<string>}
 */
async function callClaude(apiKey, prompt, maxTokens = 400) {
  if (!apiKey) throw new Error('No Anthropic API key — add one in plugin settings.');

  const response = await requestUrl({
    url: 'https://api.anthropic.com/v1/messages',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (response.status < 200 || response.status >= 300) {
    throw new Error(`Anthropic API error ${response.status}: ${response.text}`);
  }

  return response.json?.content?.[0]?.text ?? '';
}

/**
 * Parse the first JSON object out of a Claude response string.
 * Handles code-fenced responses gracefully.
 *
 * @param {string} text
 * @returns {object}
 */
function extractJsonObject(text) {
  const raw = String(text || '').replace(/^```[a-z]*\n?/i, '').replace(/```$/i, '').trim();
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) throw new Error('No JSON object in AI response');
  return JSON.parse(raw.slice(start, end + 1));
}

/**
 * Parse the first JSON array out of a Claude response string.
 *
 * @param {string} text
 * @returns {Array}
 */
function extractJsonArray(text) {
  const raw = String(text || '').replace(/^```[a-z]*\n?/i, '').replace(/```$/i, '').trim();
  const start = raw.indexOf('[');
  const end = raw.lastIndexOf(']');
  if (start === -1 || end === -1 || end < start) throw new Error('No JSON array in AI response');
  return JSON.parse(raw.slice(start, end + 1));
}

module.exports = { callClaude, extractJsonObject, extractJsonArray, ANTHROPIC_MODEL };
