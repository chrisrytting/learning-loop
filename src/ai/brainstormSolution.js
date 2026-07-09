'use strict';

const { callAI, extractJsonObject } = require('./client');

const DEFAULT_BRAINSTORM_ANTHROPIC_MODEL = 'claude-sonnet-4-6';

async function parseBrainstormSolution(problemText, question, answer, settings, collector = null) {
  const cleanAnswer = String(answer || '').trim();
  if (!cleanAnswer) return '';

  if (settings?.aiProvider === 'anthropic' && !settings?.anthropicApiKey) {
    return conciseFallback(cleanAnswer);
  }

  const prompt = [
    'Turn the user response into one concise solution/action phrase to try for the current problem.',
    'Return ONLY raw JSON with this shape: {"solution":"concise action phrase"}.',
    '',
    'Rules:',
    '- The solution should be concrete enough to try soon.',
    '- Do not include a leading subject like "I should".',
    '- Do not mention that it came from an interview question.',
    '- If the answer has several ideas, choose the strongest one.',
    '- If there is no usable idea, return an empty string.',
    '',
    `Problem: ${JSON.stringify(problemText || '')}`,
    `Question: ${JSON.stringify(question || '')}`,
    `User response: ${JSON.stringify(cleanAnswer)}`,
  ].join('\n');

  try {
    const anthropicModel = String(settings?.brainstormAnthropicModel || '').trim()
      || DEFAULT_BRAINSTORM_ANTHROPIC_MODEL;
    const text = await callAI(settings, prompt, 180, collector, {
      anthropicModel,
    });
    const parsed = extractJsonObject(text);
    return typeof parsed.solution === 'string' ? parsed.solution.trim() : '';
  } catch {
    return conciseFallback(cleanAnswer);
  }
}

function conciseFallback(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .replace(/^[\s"']+|[\s"'.]+$/g, '')
    .slice(0, 140)
    .trim();
}

module.exports = { parseBrainstormSolution, conciseFallback, DEFAULT_BRAINSTORM_ANTHROPIC_MODEL };
