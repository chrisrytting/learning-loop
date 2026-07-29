'use strict';

const { writeCommandUsageLog, formatAiCallAudit, fencedText } = require('./logs');

function makeApp() {
  const files = new Map();
  const adapter = {
    exists: jest.fn(async path => files.has(path)),
    mkdir: jest.fn(async path => files.set(path, null)),
    write: jest.fn(async (path, content) => files.set(path, content)),
  };
  return { app: { vault: { adapter } }, files };
}

test('writes separate token and thinking details for every AI call', async () => {
  const { app, files } = makeApp();
  const timestamp = new Date('2026-07-21T12:13:35');
  await writeCommandUsageLog(app, {
    command: 'alpine-plus',
    executionLink: '[[Daily|Daily:1]]',
    timestamp,
    trajectoryEntries: ['User cue: Build a hump', 'First request failed', 'Second request succeeded'],
    usages: [
      {
        model: 'claude-sonnet-5',
        purpose: 'Alpine+: answer project cue',
        inputTokens: 4960,
        outputTokens: 1800,
        thinkingTokens: 1200,
      },
      {
        model: 'claude-sonnet-5',
        purpose: 'Alpine+: answer project cue',
        inputTokens: 4960,
        outputTokens: 1699,
        thinkingTokens: 800,
      },
    ],
  });

  const log = files.get('Logs/2026-07-21-121335-alpine-plus.md');
  expect(log).toContain('cost_usd: 0.05483');
  expect(log).toContain('in=9920 out=3499 think=2000 usd=0.05483');
  expect(log).toContain('## Trajectory');
  expect(log).toContain('### Call 1: Alpine+: answer project cue');
  expect(log).toContain('- Thinking tokens: 1200');
  expect(log).toContain('- Approximate visible-output tokens: 600');
  expect(log).toContain('### Call 2: Alpine+: answer project cue');
  expect(log).toContain('Raw transcript: not captured');
});

test('includes raw prompt and response only when the collector supplied them', () => {
  const audit = formatAiCallAudit({
    model: 'claude-haiku-4-5',
    purpose: 'Test request',
    inputTokens: 10,
    outputTokens: 5,
    thinkingTokens: 0,
    prompt: 'private vault content',
    response: '{"ok":true}',
  }, 0, new Date('2026-07-21T12:00:00Z'));

  expect(audit).toContain('- Raw transcript: captured');
  expect(audit).toContain('private vault content');
  expect(audit).toContain('{"ok":true}');
});

test('chooses a longer Markdown fence when transcript text contains backticks', () => {
  expect(fencedText('```nested```').startsWith('````text\n')).toBe(true);
});
