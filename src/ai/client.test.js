'use strict';

jest.mock('obsidian', () => ({ requestUrl: jest.fn() }));

const { requestUrl } = require('obsidian');
const { callAI } = require('./client');

const OK_RESPONSE = {
  status: 200,
  json: { content: [{ type: 'text', text: 'hi' }], usage: { input_tokens: 10, output_tokens: 5 } },
};

beforeEach(() => jest.clearAllMocks());

test('callAI sends the anthropicApiKey from settings as the x-api-key header', async () => {
  requestUrl.mockResolvedValue(OK_RESPONSE);
  await callAI({ aiProvider: 'anthropic', anthropicApiKey: 'sk-test-123' }, 'hello');
  expect(requestUrl.mock.calls[0][0].headers['x-api-key']).toBe('sk-test-123');
  expect(requestUrl.mock.calls[0][0].throw).toBe(false);
});

test('callAI uses the default Anthropic model unless an override is provided', async () => {
  requestUrl.mockResolvedValue(OK_RESPONSE);
  await callAI({ aiProvider: 'anthropic', anthropicApiKey: 'sk-test-123' }, 'hello');

  expect(JSON.parse(requestUrl.mock.calls[0][0].body).model).toBe('claude-haiku-4-5');
});

test('callAI can send a per-call Anthropic model override', async () => {
  requestUrl.mockResolvedValue(OK_RESPONSE);
  await callAI(
    { aiProvider: 'anthropic', anthropicApiKey: 'sk-test-123' },
    'hello',
    400,
    null,
    { anthropicModel: 'claude-sonnet-4-6' },
  );

  expect(JSON.parse(requestUrl.mock.calls[0][0].body).model).toBe('claude-sonnet-4-6');
});

test('callAI sends Anthropic structured-output and effort settings when provided', async () => {
  requestUrl.mockResolvedValue(OK_RESPONSE);
  const schema = {
    type: 'object',
    properties: { answer: { type: 'string' } },
    required: ['answer'],
    additionalProperties: false,
  };

  await callAI(
    { aiProvider: 'anthropic', anthropicApiKey: 'sk-test-123' },
    'hello',
    400,
    null,
    { anthropicModel: 'claude-sonnet-5', outputSchema: schema, effort: 'low' },
  );

  expect(JSON.parse(requestUrl.mock.calls[0][0].body).output_config).toEqual({
    format: { type: 'json_schema', schema },
    effort: 'low',
  });
});

test('callAI records purpose, thinking tokens, and opt-in transcripts per call', async () => {
  requestUrl.mockResolvedValue({
    status: 200,
    json: {
      content: [{ type: 'text', text: '{"answer":"ready"}' }],
      usage: {
        input_tokens: 120,
        output_tokens: 80,
        output_tokens_details: { thinking_tokens: 55 },
      },
    },
  });
  const collector = { captureTranscripts: true, add: jest.fn() };

  await callAI(
    { aiProvider: 'anthropic', anthropicApiKey: 'sk-test-123' },
    'private prompt',
    400,
    collector,
    { anthropicModel: 'claude-sonnet-5', purpose: 'Alpine+: answer project cue' },
  );

  expect(collector.add).toHaveBeenCalledWith({
    inputTokens: 120,
    outputTokens: 80,
    thinkingTokens: 55,
    model: 'claude-sonnet-5',
    purpose: 'Alpine+: answer project cue',
    prompt: 'private prompt',
    response: '{"answer":"ready"}',
  });
});

test('callAI returns text even when a newer model emits a reasoning block first', async () => {
  requestUrl.mockResolvedValue({
    status: 200,
    json: {
      content: [
        { type: 'thinking', thinking: '' },
        { type: 'text', text: '{"answer":"ready"}' },
      ],
      usage: { input_tokens: 10, output_tokens: 5 },
    },
  });

  await expect(callAI(
    { aiProvider: 'anthropic', anthropicApiKey: 'sk-test-123' },
    'hello',
    400,
    null,
    { anthropicModel: 'claude-sonnet-5' },
  )).resolves.toBe('{"answer":"ready"}');
});

test('callAI throws when anthropicApiKey is missing from settings', async () => {
  await expect(callAI({ aiProvider: 'anthropic', anthropicApiKey: '' }, 'hello'))
    .rejects.toThrow('No Anthropic API key');
});

test('callAI surfaces the Anthropic response body for HTTP errors', async () => {
  requestUrl.mockResolvedValue({
    status: 400,
    text: '{"type":"error"}',
    json: {
      error: {
        type: 'invalid_request_error',
        message: 'output_config.format.schema: maxItems is not supported',
      },
    },
  });

  await expect(callAI(
    { aiProvider: 'anthropic', anthropicApiKey: 'sk-test-123' },
    'hello',
  )).rejects.toThrow(
    'Anthropic API error 400: output_config.format.schema: maxItems is not supported',
  );
});

test('callAI reports truncated structured responses without attempting to parse them', async () => {
  requestUrl.mockResolvedValue({
    ...OK_RESPONSE,
    json: { ...OK_RESPONSE.json, stop_reason: 'max_tokens' },
  });

  await expect(callAI(
    { aiProvider: 'anthropic', anthropicApiKey: 'sk-test-123' },
    'hello',
  )).rejects.toThrow('cut off');
});
