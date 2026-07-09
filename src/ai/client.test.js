'use strict';

jest.mock('obsidian', () => ({ requestUrl: jest.fn() }));

const { requestUrl } = require('obsidian');
const { callAI } = require('./client');

const OK_RESPONSE = {
  status: 200,
  json: { content: [{ text: 'hi' }], usage: { input_tokens: 10, output_tokens: 5 } },
};

beforeEach(() => jest.clearAllMocks());

test('callAI sends the anthropicApiKey from settings as the x-api-key header', async () => {
  requestUrl.mockResolvedValue(OK_RESPONSE);
  await callAI({ aiProvider: 'anthropic', anthropicApiKey: 'sk-test-123' }, 'hello');
  expect(requestUrl.mock.calls[0][0].headers['x-api-key']).toBe('sk-test-123');
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

test('callAI throws when anthropicApiKey is missing from settings', async () => {
  await expect(callAI({ aiProvider: 'anthropic', anthropicApiKey: '' }, 'hello'))
    .rejects.toThrow('No Anthropic API key');
});
