const COST_DIR = '.trajectory_costs';

// USD per million tokens — update if pricing changes
const MODEL_PRICING = {
  'claude-haiku-4-5-20251001': { input: 0.80, output: 4.00 },
  'claude-haiku-3-5-20241022': { input: 0.80, output: 4.00 },
  'claude-sonnet-4-5-20251001': { input: 3.00, output: 15.00 },
  'claude-opus-4-5-20251001':   { input: 15.00, output: 75.00 },
};

function calcCost(model, inputTokens, outputTokens) {
  const pricing = MODEL_PRICING[model] ?? { input: 0.80, output: 4.00 };
  return (inputTokens / 1_000_000) * pricing.input
       + (outputTokens / 1_000_000) * pricing.output;
}

async function logAiCost(app, { command, model, usage }) {
  const adapter = app.vault.adapter;
  if (!await adapter.exists(COST_DIR)) await adapter.mkdir(COST_DIR);

  const inputTokens  = usage?.input_tokens  ?? 0;
  const outputTokens = usage?.output_tokens ?? 0;
  const costUsd = calcCost(model, inputTokens, outputTokens);

  const entry = {
    timestamp:     new Date().toISOString(),
    command,
    model,
    input_tokens:  inputTokens,
    output_tokens: outputTokens,
    total_tokens:  inputTokens + outputTokens,
    cost_usd:      parseFloat(costUsd.toFixed(8)),
  };

  const today    = new Date().toISOString().split('T')[0];
  const filePath = `${COST_DIR}/${today}.jsonl`;
  const existing = await adapter.exists(filePath) ? await adapter.read(filePath) : '';
  await adapter.write(filePath, existing + JSON.stringify(entry) + '\n');
}

module.exports = { logAiCost };
