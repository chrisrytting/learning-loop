'use strict';

/**
 * vault/executionLink.js
 *
 * Build a wikilink to the note location where a command was run.
 * Prefers block references (^id) when Obsidian has indexed them.
 */

/**
 * @param {import('obsidian').App} app
 * @param {import('obsidian').TFile | null} file
 * @param {number} line - 0-based line index in the editor
 * @returns {string}
 */
function buildExecutionWikiLink(app, file, line) {
  if (!file) return '(no active note)';

  const blockId = findBlockIdForLine(app, file, line);
  const linkpath = file.path.replace(/\.md$/i, '');

  if (blockId) {
    return `[[${linkpath}#^${blockId}|${file.basename}]]`;
  }

  return `[[${linkpath}|${file.basename}:${line + 1}]]`;
}

/**
 * @param {import('obsidian').App} app
 * @param {import('obsidian').TFile} file
 * @param {number} line
 * @returns {string | null} block id without leading ^
 */
function findBlockIdForLine(app, file, line) {
  const blocks = app.metadataCache.getFileCache(file)?.blocks;
  if (!blocks) return null;

  for (const [id, block] of Object.entries(blocks)) {
    const start = block.position?.start?.line;
    if (start === undefined) continue;
    const end = block.position?.end?.line ?? start;
    if (line < start || line > end) continue;
    return id;
  }

  return null;
}

/**
 * @param {import('obsidian').Editor} editor
 * @returns {{ fromLine: number, toLine: number }}
 */
function getLogExecutionRange(editor) {
  if (editor.somethingSelected()) {
    const from = editor.getCursor('from');
    const to = editor.getCursor('to');
    return { fromLine: from.line, toLine: to.line };
  }
  const cursor = editor.getCursor();
  return { fromLine: cursor.line, toLine: cursor.line };
}

module.exports = { buildExecutionWikiLink, findBlockIdForLine, getLogExecutionRange };
