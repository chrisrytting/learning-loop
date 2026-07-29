'use strict';

const { AiUsageCollector } = require('./usageCollector');

describe('AiUsageCollector', () => {
  test('starts empty', () => {
    const c = new AiUsageCollector();
    expect(c.usages).toEqual([]);
    expect(c.hasUsage()).toBe(false);
  });

  test('keeps transcript capture off unless explicitly enabled', () => {
    expect(new AiUsageCollector().captureTranscripts).toBe(false);
    expect(new AiUsageCollector({ captureTranscripts: true }).captureTranscripts).toBe(true);
  });

  test('adds valid usage', () => {
    const c = new AiUsageCollector();
    c.add({ inputTokens: 100, outputTokens: 50, model: 'claude-haiku-4-5' });
    expect(c.usages).toHaveLength(1);
    expect(c.hasUsage()).toBe(true);
  });

  test('ignores null', () => {
    const c = new AiUsageCollector();
    c.add(null);
    expect(c.usages).toHaveLength(0);
  });

  test('ignores zero-token entry', () => {
    const c = new AiUsageCollector();
    c.add({ inputTokens: 0, outputTokens: 0, model: 'claude-haiku-4-5' });
    expect(c.usages).toHaveLength(0);
  });

  test('keeps a transcript even when a local provider omits token counts', () => {
    const c = new AiUsageCollector({ captureTranscripts: true });
    c.add({
      inputTokens: 0,
      outputTokens: 0,
      model: 'local-model',
      prompt: 'prompt',
      response: 'response',
    });
    expect(c.usages).toHaveLength(1);
  });

  test('entry with only inputTokens is kept', () => {
    const c = new AiUsageCollector();
    c.add({ inputTokens: 100, outputTokens: 0, model: 'claude-haiku-4-5' });
    expect(c.usages).toHaveLength(1);
  });

  test('accumulates multiple entries', () => {
    const c = new AiUsageCollector();
    c.add({ inputTokens: 100, outputTokens: 50, model: 'claude-haiku-4-5' });
    c.add({ inputTokens: 200, outputTokens: 100, model: 'claude-haiku-4-5' });
    expect(c.usages).toHaveLength(2);
  });
});
