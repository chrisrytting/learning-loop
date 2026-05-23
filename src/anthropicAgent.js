'use strict';

const PROBLEM_IDENTIFICATION_OUTPUT_FORMAT = {
  type: 'json_schema',
  schema: {
    type: 'object',
    properties: {
      problemName: {
        type: 'string',
        description: 'Exact existing Problems page name, or a new title-cased name, or empty if none',
      },
      matchedExisting: {
        type: 'boolean',
        description: 'True when problemName is one of the existing Problems pages',
      },
      confidence: {
        type: 'number',
        description: 'Confidence from 0 to 1',
      },
    },
    required: ['problemName', 'matchedExisting', 'confidence'],
    additionalProperties: false,
  },
};

let queryOverride = null;

function setQueryForTests(fn) {
  queryOverride = fn;
}

async function loadQuery() {
  if (queryOverride) return queryOverride;
  const { query } = await import('@anthropic-ai/claude-agent-sdk');
  return query;
}

function buildAgentEnv(apiKey) {
  return {
    ...process.env,
    ANTHROPIC_API_KEY: apiKey,
    CLAUDE_AGENT_SDK_CLIENT_APP: 'learning-loop/1.0.0',
  };
}

function buildProblemIdentificationPrompt(utterance, existingProblemNames) {
  return [
    'Identify the primary problem or symptom in the user utterance.',
    '',
    'You are given the exact names of existing Problems pages in an Obsidian vault.',
    'Decide whether the utterance matches one of those pages semantically.',
    '',
    `Existing Problems page names: ${JSON.stringify(existingProblemNames)}`,
    '',
    'Rules:',
    '- Use semantic interpretation only.',
    '- If an existing page name matches, set matchedExisting=true and problemName to that exact string.',
    '- If no existing page fits, set matchedExisting=false and propose a concise title-cased problemName suitable as a filename.',
    '- If the utterance does not describe a problem or symptom, return problemName="" and confidence below 0.5.',
    '',
    `User utterance: ${JSON.stringify(utterance)}`,
  ].join('\n');
}

function parseStructuredOutput(message) {
  if (message.structured_output && typeof message.structured_output === 'object') {
    return message.structured_output;
  }
  if (typeof message.result === 'string' && message.result.trim()) {
    return JSON.parse(message.result);
  }
  return null;
}

async function identifyProblemWithAgent(utterance, existingProblemNames, apiKey) {
  const query = await loadQuery();
  const prompt = buildProblemIdentificationPrompt(utterance, existingProblemNames);
  let structuredOutput = null;
  let lastError = null;

  for await (const message of query({
    prompt,
    options: {
      tools: [],
      maxTurns: 1,
      model: 'claude-haiku-4-5-20251001',
      outputFormat: PROBLEM_IDENTIFICATION_OUTPUT_FORMAT,
      settingSources: [],
      env: buildAgentEnv(apiKey),
    },
  })) {
    if (message.type === 'result' && message.subtype === 'success') {
      try {
        structuredOutput = parseStructuredOutput(message);
      } catch (error) {
        lastError = error.message;
      }
      break;
    }

    if (message.type === 'result') {
      lastError = message.errors?.join('; ')
        || `Agent query failed (${message.subtype})`;
      break;
    }
  }

  if (!structuredOutput) {
    throw new Error(lastError || 'Agent returned no structured output');
  }

  return {
    problemName: typeof structuredOutput.problemName === 'string'
      ? structuredOutput.problemName.trim()
      : '',
    matchedExisting: Boolean(structuredOutput.matchedExisting),
    confidence: Number(structuredOutput.confidence || 0),
  };
}

module.exports = {
  PROBLEM_IDENTIFICATION_OUTPUT_FORMAT,
  buildProblemIdentificationPrompt,
  identifyProblemWithAgent,
  setQueryForTests,
};
