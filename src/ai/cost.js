'use strict';

/**
 * ai/cost.js
 *
 * Estimate USD from token usage. Rates are per million tokens (MTok).
 * Update when Anthropic changes list prices: https://www.anthropic.com/pricing
 */

const MODEL_RATES_USD_PER_MTOK = {
  'claude-fable-5':            { input: 10, output: 50 },
  'claude-opus-4-8':           { input: 5,  output: 25 },
  'claude-opus-4-7':           { input: 5,  output: 25 },
  'claude-opus-4-6':           { input: 5,  output: 25 },
  'claude-sonnet-4-6':         { input: 3,  output: 15 },
  'claude-haiku-4-5':          { input: 1,  output: 5  },
  'claude-haiku-4-5-20251001': { input: 1,  output: 5  },
};

/**
 * @param {{ inputTokens: number, outputTokens: number, model: string }} usage
 * @returns {number}
 */
function computeCostUsd(usage) {
  const rates = MODEL_RATES_USD_PER_MTOK[usage.model];
  if (!rates) return 0;
  const input = (usage.inputTokens / 1_000_000) * rates.input;
  const output = (usage.outputTokens / 1_000_000) * rates.output;
  return input + output;
}

/**
 * @param {Array<{ inputTokens: number, outputTokens: number, model: string }>} usages
 * @returns {Array<{ model: string, inputTokens: number, outputTokens: number, costUsd: number }>}
 */
function aggregateByModel(usages) {
  const byModel = new Map();
  for (const u of usages) {
    const prev = byModel.get(u.model) ?? { model: u.model, inputTokens: 0, outputTokens: 0 };
    prev.inputTokens += u.inputTokens;
    prev.outputTokens += u.outputTokens;
    byModel.set(u.model, prev);
  }
  return [...byModel.values()].map(row => ({
    ...row,
    costUsd: computeCostUsd(row),
  }));
}

/**
 * @param {Array<{ model: string, inputTokens: number, outputTokens: number, costUsd: number }>} rows
 * @returns {string}
 */
function formatModelUsageSegment(rows) {
  return rows.map(r => {
    const usd = r.costUsd < 0.0001 ? r.costUsd.toExponential(2) : r.costUsd.toFixed(5);
    return `${r.model} in=${r.inputTokens} out=${r.outputTokens} usd=${usd}`;
  }).join('; ');
}

module.exports = { computeCostUsd, aggregateByModel, formatModelUsageSegment, MODEL_RATES_USD_PER_MTOK };
