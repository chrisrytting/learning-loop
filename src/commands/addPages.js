'use strict';

const { AddPagesModal } = require('../ui/AddPagesModal');

/**
 * Return the repeatable Markdown prefix before the cursor. This keeps inserted
 * links as siblings when the cursor is in a list, task, or blockquote.
 */
function getLinePrefix(line, cursorCh) {
  const beforeCursor = line.slice(0, cursorCh);
  const structural = beforeCursor.match(/^(\s*(?:(?:>\s*)+)?(?:(?:[-+*]|\d+[.)])\s+(?:\[[ xX]\]\s+)?)?)$/);
  if (structural) return structural[1];
  return (line.match(/^\s*/) || [''])[0];
}

function buildLinkInsertion(links, prefix) {
  return links.join(`\n${prefix}`);
}

function addPagesCommand(app, editor) {
  const cursor = editor.getCursor();
  const prefix = getLinePrefix(editor.getLine(cursor.line), cursor.ch);
  const sourcePath = app.workspace.getActiveFile()?.path || '';

  new AddPagesModal(app, async (files) => {
    const links = files.map(file => app.fileManager.generateMarkdownLink(file, sourcePath));
    const insertion = buildLinkInsertion(links, prefix);
    editor.replaceRange(insertion, cursor);

    const lines = insertion.split('\n');
    editor.setCursor({
      line: cursor.line + lines.length - 1,
      ch: lines.length === 1 ? cursor.ch + lines[0].length : lines.at(-1).length,
    });
  }).open();
}

module.exports = { addPagesCommand, getLinePrefix, buildLinkInsertion };
