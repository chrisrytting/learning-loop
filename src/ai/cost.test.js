'use strict';

const {
  computeCostUsd,
  aggregateByModel,
  formatModelUsageSegment,
  MODEL_RATES_USD_PER_MTOK,
} = require('./cost');

describe('computeCostUsd', () => {
  test('computes cost for haiku', () => {
    // $1/MTok in + $5/MTok out
    const cost = computeCostUsd({ model: 'claude-haiku-4-5', inputTokens: 1_000_000, outputTokens: 1_000_000 });
    expect(cost).toBeCloseTo(6);
  });

  test('computes cost for opus', () => {
    // $5/MTok in + $25/MTok out
    const cost = computeCostUsd({ model: 'claude-opus-4-8', inputTokens: 1_000_000, outputTokens: 1_000_000 });
    expect(cost).toBeCloseTo(30);
  });

  test('returns 0 for unknown model', () => {
    expect(computeCostUsd({ model: 'unknown', inputTokens: 1000, outputTokens: 500 })).toBe(0);
  });

  test('handles zero tokens', () => {
    expect(computeCostUsd({ model: 'claude-haiku-4-5', inputTokens: 0, outputTokens: 0 })).toBe(0);
  });

  test('handles small real-world token counts', () => {
    const cost = computeCostUsd({ model: 'claude-haiku-4-5', inputTokens: 500, outputTokens: 200 });
    // $1/MTok * (500/1M) + $5/MTok * (200/1M) = 0.0005 + 0.001 = 0.0015
    expect(cost).toBeCloseTo(0.0015, 7);
  });

  test('all current models have rates', () => {
    const models = Object.keys(MODEL_RATES_USD_PER_MTOK);
    expect(models.length).toBeGreaterThanOrEqual(6);
    for (const model of models) {
      const { input, output } = MODEL_RATES_USD_PER_MTOK[model];
      expect(typeof input).toBe('number');
      expect(typeof output).toBe('number');
      expect(input).toBeGreaterThan(0);
      expect(output).toBeGreaterThan(0);
    }
  });
});

describe('aggregateByModel', () => {
  test('returns empty for no usages', () => {
    expect(aggregateByModel([])).toEqual([]);
  });

  test('sums tokens for the same model', () => {
    const result = aggregateByModel([
      { model: 'claude-haiku-4-5', inputTokens: 100, outputTokens: 50 },
      { model: 'claude-haiku-4-5', inputTokens: 200, outputTokens: 100 },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].inputTokens).toBe(300);
    expect(result[0].outputTokens).toBe(150);
    expect(result[0].costUsd).toBeGreaterThan(0);
  });

  test('keeps different models separate', () => {
    const result = aggregateByModel([
      { model: 'claude-haiku-4-5', inputTokens: 100, outputTokens: 50 },
      { model: 'claude-sonnet-4-6', inputTokens: 200, outputTokens: 100 },
    ]);
    expect(result).toHaveLength(2);
    const models = result.map(r => r.model);
    expect(models).toContain('claude-haiku-4-5');
    expect(models).toContain('claude-sonnet-4-6');
  });

  test('attaches costUsd to each row', () => {
    const result = aggregateByModel([
      { model: 'claude-haiku-4-5', inputTokens: 1_000_000, outputTokens: 0 },
    ]);
    expect(result[0].costUsd).toBeCloseTo(1); // $1/MTok input
  });
});

describe('formatModelUsageSegment', () => {
  test('formats a single row', () => {
    const rows = [{ model: 'claude-haiku-4-5', inputTokens: 100, outputTokens: 50, costUsd: 0.5 }];
    const result = formatModelUsageSegment(rows);
    expect(result).toContain('claude-haiku-4-5');
    expect(result).toContain('in=100');
    expect(result).toContain('out=50');
    expect(result).toContain('usd=0.50000');
  });

  test('uses scientific notation for tiny costs', () => {
    const rows = [{ model: 'claude-haiku-4-5', inputTokens: 100, outputTokens: 50, costUsd: 0.000001 }];
    const result = formatModelUsageSegment(rows);
    expect(result).toMatch(/usd=1\.00e-6/);
  });

  test('joins multiple rows with semicolons', () => {
    const rows = [
      { model: 'claude-haiku-4-5', inputTokens: 100, outputTokens: 50, costUsd: 0.1 },
      { model: 'claude-sonnet-4-6', inputTokens: 200, outputTokens: 100, costUsd: 0.2 },
    ];
    const result = formatModelUsageSegment(rows);
    expect(result).toContain('; ');
  });

  test('returns empty string for no rows', () => {
    expect(formatModelUsageSegment([])).toBe('');
  });
});
