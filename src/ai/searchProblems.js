'use strict';

/**
 * ai/searchProblems.js
 *
 * Pure function: given a cue text and a query index (array of {query, page} pairs),
 * asks Claude which problem pages are semantically relevant.
 *
 * No side effects, no vault reads/writes, no UI.
 */

const { callClaude, extractJsonArray } = require('./client');

/**
 * @param {string} cueText                    - The user's thought/cue
 * @param {Array<{query: string, page: string}>} queryIndex - Built from Problems/ frontmatter
 * @param {string[]} excludeNames             - Pages already surfaced by other means
 * @param {string} apiKey
 * @returns {Promise<{
 *   matches: string[],   - Page names from the index that are relevant
 *   warning: string|null - Human-readable warning if something went wrong
 * }>}
 */
async function searchProblems(cueText, queryIndex, excludeNames, apiKey) {
  if (!apiKey) {
    return { matches: [], warning: '⚠ No API key — add one in plugin settings to enable AI search.' };
  }

  if (queryIndex.length === 0) {
    return { matches: [], warning: null };
  }

  const indexText = queryIndex.map(e => `- "${e.query}" → ${e.page}`).join('\n');
  const prompt = [
    `Given this cue: "${cueText}"`,
    '',
    'Here is an index of past queries mapped to their problem pages:',
    indexText,
    '',
    'Return a JSON array of page names whose queries are semantically similar to the cue.',
    'Only return page names from the index. Deduplicate. Return ONLY a raw JSON array.',
    'Example: ["Stress", "Anxiety"]',
  ].join('\n');

  try {
    const text = await callClaude(apiKey, prompt, 256);
    const parsed = extractJsonArray(text);

    const validNames = new Set(queryIndex.map(e => e.page));
    const excludeSet = new Set(excludeNames);

    const matches = parsed.filter(
      name => typeof name === 'string' && validNames.has(name) && !excludeSet.has(name)
    );

    return { matches, warning: null };
  } catch (error) {
    return { matches: [], warning: `⚠ AI search failed: ${error.message}` };
  }
}

module.exports = { searchProblems };
