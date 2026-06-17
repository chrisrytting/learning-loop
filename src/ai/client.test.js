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

test('callAI throws when anthropicApiKey is missing from settings', async () => {
  await expect(callAI({ aiProvider: 'anthropic', anthropicApiKey: '' }, 'hello'))
    .rejects.toThrow('No Anthropic API key');
});
