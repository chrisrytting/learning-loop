'use strict';

const { requestUrl } = require('obsidian');

const ANTHROPIC_MODEL = 'claude-haiku-4-5';
const DEFAULT_OLLAMA_MODEL = 'qwen3:latest';
const DEFAULT_OLLAMA_BASE_URL = 'http://localhost:11434';

async function callClaude(apiKey, prompt, maxTokens = 400, collector = null) {
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

  if (collector) {
    collector.add({
      inputTokens: response.json?.usage?.input_tokens ?? 0,
      outputTokens: response.json?.usage?.output_tokens ?? 0,
      model: ANTHROPIC_MODEL,
    });
  }

  return response.json?.content?.[0]?.text ?? '';
}



async function callOllama(settings, prompt, maxTokens = 400) {
  const baseUrl = settings.ollamaBaseUrl || DEFAULT_OLLAMA_BASE_URL;
  const model = settings.ollamaModel || DEFAULT_OLLAMA_MODEL;

  const response = await requestUrl({
    url: `${baseUrl}/v1/chat/completions`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
      think: false,
    }),
  });

  if (response.status < 200 || response.status >= 300) {
    throw new Error(`Ollama API error ${response.status}: ${response.text}`);
  }

  return response.json?.choices?.[0]?.message?.content ?? '';
}

async function callAI(settings, prompt, maxTokens = 400, collector = null) {
  if (settings?.aiProvider === 'ollama') {
    return callOllama(settings, prompt, maxTokens);
  }
  return callClaude(settings?.anthropicApiKey, prompt, maxTokens, collector);
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

module.exports = { callClaude, callAI, extractJsonObject, extractJsonArray, ANTHROPIC_MODEL, DEFAULT_OLLAMA_MODEL, DEFAULT_OLLAMA_BASE_URL };
