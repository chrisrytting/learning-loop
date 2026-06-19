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

const { aggregateByModel, formatModelUsageSegment } = require('../ai/cost');

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
    const rows = aggregateByModel(entry.usages);
    const totalCost = rows.reduce((sum, r) => sum + r.costUsd, 0);
    fmLines.push(`cost_usd: ${totalCost}`);
    fmLines.push(`usage_detail: "${formatModelUsageSegment(rows)}"`);
  }

  if (entry.executionLink) {
    fmLines.push(`execution_link: "[[${entry.executionLink.replace(/^\[\[/, '').replace(/\]\]$/, '')}]]"`);
  }

  fmLines.push('---', '');

  const body = hasTrajectory
    ? entry.trajectoryEntries.map(e => `- ${e}`).join('\n') + '\n'
    : '';

  const filename = `${LOGS_DIR}/${formatFilenameTimestamp(ts)}-${entry.command}.md`;
  await adapter.write(filename, fmLines.join('\n') + body);
}

module.exports = {
  LOGS_DIR,
  LOGS_BASE_PATH,
  formatTimestamp,
  writeCommandUsageLog,
};
