'use strict';

/**
 * commands/log.js
 *
 * Entry point for the Log command. Thin dispatcher — reads editor input,
 * calls AI to parse it, opens LogConfirmModal, writes on confirm.
 */

const { parseLogEntry } = require('../ai/parseLogEntry');
const { AiUsageCollector } = require('../ai/usageCollector');
const { readProblemFiles, writeProblemLog } = require('../vault/problems');
const { buildExecutionWikiLink, getLogExecutionRange } = require('../vault/executionLink');
const { writeCommandUsageLog } = require('../vault/logs');
const { LogConfirmModal } = require('../ui/LogConfirmModal');

/**
 * @param {import('obsidian').App} app
 * @param {import('obsidian').Editor} editor
 * @param {{ anthropicApiKey: string }} settings
 */
async function logCommand(app, editor, settings) {
  const selectedText = editor.getSelection();
  const cursor = editor.getCursor();
  const input = selectedText || editor.getLine(cursor.line);

  if (!input.trim()) return;

  const file = app.workspace.getActiveFile();
  const { fromLine } = getLogExecutionRange(editor);
  const executedAt = new Date();
  const collector = new AiUsageCollector();

  const problemFiles = await readProblemFiles(app);
  const parsed = await parseLogEntry(input, problemFiles, settings, collector);

  if (collector.hasUsage()) {
    const executionLink = buildExecutionWikiLink(app, file, fromLine);
    writeCommandUsageLog(app, {
      command: 'log',
      executionLink,
      usages: collector.usages,
      timestamp: executedAt,
    }).catch(err => console.warn('Learning Loop: failed to write usage log', err));
  }

  const modal = new LogConfirmModal(app, parsed, async (confirmed) => {
    if (!confirmed) return;
    await writeProblemLog(app, confirmed);
  });

  modal.open();
}

module.exports = { logCommand };
