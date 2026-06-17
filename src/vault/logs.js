'use strict';

/**
 * vault/logs.js
 *
 * Directory-based AI usage log.
 *
 * Each command run writes its own note to Logs/ with YAML frontmatter.
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
 * @param {import('obsidian').App} app
 * @param {{
 *   command: 'help' | 'log',
 *   executionLink: string,
 *   usages: Array<{ inputTokens: number, outputTokens: number, model: string }>,
 *   timestamp?: Date,
 * }} entry
 */
async function writeCommandUsageLog(app, entry) {
  if (!entry.usages?.length) return;

  const adapter = app.vault.adapter;
  const ts = entry.timestamp ?? new Date();
  const rows = aggregateByModel(entry.usages);
  const totalCost = rows.reduce((sum, r) => sum + r.costUsd, 0);
  const usageDetail = formatModelUsageSegment(rows);

  // Ensure Logs/ directory exists
  if (!(await adapter.exists(LOGS_DIR))) {
    await adapter.mkdir(LOGS_DIR);
  }

  // Ensure Overview.base exists inside Logs/
  if (!(await adapter.exists(LOGS_BASE_PATH))) {
    await adapter.write(LOGS_BASE_PATH, LOGS_BASE_CONTENT);
  }

  // Write the per-run log file
  const filename = `${LOGS_DIR}/${formatFilenameTimestamp(ts)}-${entry.command}.md`;
  const frontmatter = [
    '---',
    `timestamp: "${formatTimestamp(ts)}"`,
    `command: ${entry.command}`,
    `cost_usd: ${totalCost}`,
    `execution_link: "[[${entry.executionLink.replace(/^\[\[/, '').replace(/\]\]$/, '')}]]"`,
    `usage_detail: "${usageDetail}"`,
    '---',
    '',
  ].join('\n');

  await adapter.write(filename, frontmatter);
}

module.exports = {
  LOGS_DIR,
  LOGS_BASE_PATH,
  formatTimestamp,
  writeCommandUsageLog,
};
