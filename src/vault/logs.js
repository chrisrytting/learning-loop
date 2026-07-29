'use strict';

/**
 * vault/logs.js
 *
 * Directory-based AI usage log.
 *
 * Each command run writes its own note to Logs/ with YAML frontmatter (cost/usage)
 * and an optional trajectory section in the body.
 * Logs/Overview.base provides an Obsidian Bases table view over the directory.
 */

const { aggregateByModel, computeCostUsd, formatModelUsageSegment } = require('../ai/cost');

const LOGS_DIR = 'Logs';
const LOGS_BASE_PATH = `${LOGS_DIR}/Overview.base`;

const LOGS_BASE_CONTENT = `filters:
  file.inFolder("${LOGS_DIR}")
views:
  - type: table
    name: "AI Usage"
    order:
      - timestamp
      - command
      - cost_usd
      - execution_link
      - file.name
    summaries:
      cost_usd: Sum
`;

/**
 * @param {Date} [date]
 * @returns {string} ISO-like timestamp: YYYY-MM-DD HH:mm:ss
 */
function formatTimestamp(date = new Date()) {
  const pad = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} `
    + `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/**
 * @param {Date} [date]
 * @returns {string} filename-safe: YYYY-MM-DD-HHmmss
 */
function formatFilenameTimestamp(date = new Date()) {
  const pad = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    + `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

/**
 * Write a per-run log note with cost frontmatter and an optional trajectory body.
 * Always writes a file when called (trajectory entries are always present);
 * cost fields are omitted if there were no AI calls.
 *
 * @param {import('obsidian').App} app
 * @param {{
 *   command: 'help' | 'log',
 *   executionLink: string,
 *   usages: Array<{ inputTokens: number, outputTokens: number, model: string }>,
 *   trajectoryEntries?: string[],
 *   timestamp?: Date,
 * }} entry
 */
async function writeCommandUsageLog(app, entry) {
  const hasUsage = entry.usages?.length > 0;
  const hasTrajectory = entry.trajectoryEntries?.length > 0;
  if (!hasUsage && !hasTrajectory) return;

  const adapter = app.vault.adapter;
  const ts = entry.timestamp ?? new Date();

  if (!(await adapter.exists(LOGS_DIR))) await adapter.mkdir(LOGS_DIR);
  if (!(await adapter.exists(LOGS_BASE_PATH))) await adapter.write(LOGS_BASE_PATH, LOGS_BASE_CONTENT);

  const fmLines = [
    '---',
    `timestamp: "${formatTimestamp(ts)}"`,
    `command: ${entry.command}`,
  ];

  if (hasUsage) {
    const rows = aggregateByModel(entry.usages, ts);
    const totalCost = rows.reduce((sum, r) => sum + r.costUsd, 0);
    fmLines.push(`cost_usd: ${totalCost}`);
    fmLines.push(`usage_detail: "${formatModelUsageSegment(rows)}"`);
  }

  if (entry.executionLink) {
    fmLines.push(`execution_link: "[[${entry.executionLink.replace(/^\[\[/, '').replace(/\]\]$/, '')}]]"`);
  }

  fmLines.push('---', '');

  const bodySections = [];
  if (hasTrajectory) {
    bodySections.push(
      '## Trajectory',
      '',
      entry.trajectoryEntries.map(e => `- ${e}`).join('\n'),
    );
  }
  if (hasUsage) {
    bodySections.push(
      '## AI calls',
      '',
      entry.usages.map((usage, index) => formatAiCallAudit(usage, index, ts)).join('\n\n'),
    );
  }
  const body = bodySections.length ? `${bodySections.join('\n\n')}\n` : '';

  const filename = `${LOGS_DIR}/${formatFilenameTimestamp(ts)}-${entry.command}.md`;
  await adapter.write(filename, fmLines.join('\n') + body);
}

function formatAiCallAudit(usage, index, timestamp) {
  const purpose = String(usage.purpose || 'AI request').replace(/\s+/g, ' ').trim();
  const thinkingTokens = Number(usage.thinkingTokens || 0);
  const visibleOutputTokens = Math.max(0, Number(usage.outputTokens || 0) - thinkingTokens);
  const cost = computeCostUsd(usage, timestamp);
  const costText = cost < 0.0001 ? cost.toExponential(2) : cost.toFixed(6);
  const lines = [
    `### Call ${index + 1}: ${purpose}`,
    '',
    `- Model: \`${usage.model}\``,
    `- Input tokens: ${usage.inputTokens || 0}`,
    `- Output tokens: ${usage.outputTokens || 0}`,
    `- Thinking tokens: ${thinkingTokens}`,
    `- Approximate visible-output tokens: ${visibleOutputTokens}`,
    `- Estimated cost: $${costText}`,
  ];

  if (typeof usage.prompt !== 'string' && typeof usage.response !== 'string') {
    lines.push('- Raw transcript: not captured (enable “Log raw AI prompts and responses” in Learning Loop settings)');
    return lines.join('\n');
  }

  lines.push(
    '- Raw transcript: captured',
    '',
    '#### Prompt',
    '',
    fencedText(usage.prompt || ''),
    '',
    '#### Response',
    '',
    fencedText(usage.response || ''),
  );
  return lines.join('\n');
}

function fencedText(value) {
  const text = String(value || '');
  const longest = Math.max(0, ...((text.match(/`+/g) || []).map(run => run.length)));
  const fence = '`'.repeat(Math.max(3, longest + 1));
  return `${fence}text\n${text}\n${fence}`;
}

module.exports = {
  LOGS_DIR,
  LOGS_BASE_PATH,
  formatTimestamp,
  formatAiCallAudit,
  fencedText,
  writeCommandUsageLog,
};
