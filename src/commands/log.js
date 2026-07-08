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
const { readThought, writeTrace } = require('../vault/trace');
const {
  buildExecutionWikiLink,
  ensureExecutionBlockLink,
} = require('../vault/executionLink');
const { writeCommandUsageLog } = require('../vault/logs');
const { LogConfirmModal } = require('../ui/LogConfirmModal');

/**
 * @param {import('obsidian').App} app
 * @param {import('obsidian').Editor} editor
 * @param {{ anthropicApiKey: string }} settings
 */
async function logCommand(app, editor, settings) {
  const thought = readThought(editor);
  const input = thought.text;

  if (!input.trim()) return;

  const file = app.workspace.getActiveFile();
  const executedAt = new Date();
  const collector = new AiUsageCollector();

  const problemFiles = await readProblemFiles(app);
  const parsed = await parseLogEntry(input, problemFiles, settings, collector);

  if (collector.hasUsage()) {
    const executionLink = buildExecutionWikiLink(app, file, thought.fromLine);
    writeCommandUsageLog(app, {
      command: 'log',
      executionLink,
      usages: collector.usages,
      timestamp: executedAt,
    }).catch(err => console.warn('Learning Loop: failed to write usage log', err));
  }

  const modal = new LogConfirmModal(app, parsed, async (confirmed) => {
    if (!confirmed) return;
    const instanceLink = ensureExecutionBlockLink(editor, file, thought.fromLine);
    await writeProblemLog(app, { ...confirmed, instanceLink });
    writeTrace(editor, {
      fromLine: thought.fromLine,
      toLine: thought.toLine,
      ch0: thought.ch0,
      ch1: editor.getLine(thought.toLine).length,
      thought: withInstanceBlockId(thought.text, instanceLink),
      relatedProblems: uniqueLinks([...(thought.relatedProblems || []), `[[${confirmed.problem}]]`]),
      relatedSolutions: thought.relatedSolutions || [],
      relatedSolutionEntries: thought.relatedSolutionEntries || [],
    });
  });

  modal.open();
}

function withInstanceBlockId(text, instanceLink) {
  const match = /#\^([^|\]]+)/.exec(instanceLink || '');
  if (!match) return text;
  const blockId = match[1];
  if (new RegExp(`\\s\\^${escapeRegExp(blockId)}\\s*$`).test(text)) return text;
  return `${text} ^${blockId}`;
}

function uniqueLinks(links) {
  return [...new Set(links.filter(Boolean))];
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = { logCommand };
