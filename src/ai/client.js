'use strict';

const { requestUrl } = require('obsidian');

const ANTHROPIC_MODEL = 'claude-haiku-4-5';
const DEFAULT_OLLAMA_MODEL = 'qwen3:latest';
const DEFAULT_OLLAMA_BASE_URL = 'http://localhost:11434';

function apiErrorMessage(provider, response) {
  const detail = response?.json?.error?.message
    || response?.json?.message
    || response?.text
    || 'Unknown error';
  return `${provider} API error ${response?.status ?? 'unknown'}: ${String(detail).trim()}`;
}

async function callClaude(
  apiKey,
  prompt,
  maxTokens = 400,
  collector = null,
  model = ANTHROPIC_MODEL,
  outputSchema = null,
  purpose = 'AI request',
  effort = null,
) {
  if (!apiKey) throw new Error('No Anthropic API key — add one in plugin settings.');
  const modelName = String(model || '').trim() || ANTHROPIC_MODEL;

  const body = {
    model: modelName,
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: prompt }],
  };
  if (outputSchema || effort) {
    body.output_config = {};
    if (outputSchema) {
      body.output_config.format = {
        type: 'json_schema',
        schema: outputSchema,
      };
    }
    if (effort) body.output_config.effort = effort;
  }

  const response = await requestUrl({
    url: 'https://api.anthropic.com/v1/messages',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
    // Obsidian otherwise rejects 400+ responses before we can surface the
    // provider's useful error message from the response body.
    throw: false,
  });

  if (response.status < 200 || response.status >= 300) {
    throw new Error(apiErrorMessage('Anthropic', response));
  }

  const responseText = (response.json?.content || [])
    .filter(block => block?.type === 'text' && typeof block.text === 'string')
    .map(block => block.text)
    .join('\n');

  if (collector) {
    collector.add({
      inputTokens: response.json?.usage?.input_tokens ?? 0,
      outputTokens: response.json?.usage?.output_tokens ?? 0,
      thinkingTokens: response.json?.usage?.output_tokens_details?.thinking_tokens ?? 0,
      model: modelName,
      purpose,
      ...(collector.captureTranscripts ? { prompt, response: responseText } : {}),
    });
  }

  if (response.json?.stop_reason === 'max_tokens') {
    throw new Error('The AI response was cut off before it finished. Try the request again.');
  }
  if (response.json?.stop_reason === 'refusal') {
    throw new Error('The selected AI model declined this request. Try another Project Guide model.');
  }

  return responseText;
}



async function callOllama(settings, prompt, maxTokens = 400, collector = null, options = {}) {
  const baseUrl = settings.ollamaBaseUrl || DEFAULT_OLLAMA_BASE_URL;
  const model = settings.ollamaModel || DEFAULT_OLLAMA_MODEL;

  const response = await requestUrl({
    url: `${baseUrl}/v1/chat/completions`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    throw: false,
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
      think: false,
    }),
  });

  if (response.status < 200 || response.status >= 300) {
    throw new Error(apiErrorMessage('Ollama', response));
  }

  const responseText = response.json?.choices?.[0]?.message?.content ?? '';
  if (collector) {
    collector.add({
      inputTokens: response.json?.usage?.prompt_tokens ?? 0,
      outputTokens: response.json?.usage?.completion_tokens ?? 0,
      thinkingTokens: response.json?.usage?.completion_tokens_details?.reasoning_tokens ?? 0,
      model,
      purpose: options.purpose || 'AI request',
      ...(collector.captureTranscripts ? { prompt, response: responseText } : {}),
    });
  }
  return responseText;
}

async function callAI(settings, prompt, maxTokens = 400, collector = null, options = {}) {
  if (settings?.aiProvider === 'ollama') {
    return callOllama(settings, prompt, maxTokens, collector, options);
  }
  return callClaude(
    settings?.anthropicApiKey,
    prompt,
    maxTokens,
    collector,
    options.anthropicModel,
    options.outputSchema,
    options.purpose || 'AI request',
    options.effort,
  );
}

function stripThinking(text) {
  return String(text || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
}

function extractJsonObject(text) {
  const raw = stripThinking(text).replace(/^```[a-z]*\n?/i, '').replace(/```$/i, '').trim();
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) throw new Error('No JSON object in AI response');
  return JSON.parse(raw.slice(start, end + 1));
}

function extractJsonArray(text) {
  const raw = stripThinking(text).replace(/^```[a-z]*\n?/i, '').replace(/```$/i, '').trim();
  const start = raw.indexOf('[');
  const end = raw.lastIndexOf(']');
  if (start === -1 || end === -1 || end < start) throw new Error('No JSON array in AI response');
  return JSON.parse(raw.slice(start, end + 1));
}

module.exports = {
  callClaude,
  callAI,
  extractJsonObject,
  extractJsonArray,
  apiErrorMessage,
  ANTHROPIC_MODEL,
  DEFAULT_OLLAMA_MODEL,
  DEFAULT_OLLAMA_BASE_URL,
};
