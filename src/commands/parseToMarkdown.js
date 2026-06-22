'use strict';

const { ParseToMarkdownModal } = require('../ui/ParseToMarkdownModal');

function blocksToMarkdown(blocks, indentLevel) {
  const tab = '\t'.repeat(indentLevel);
  const lines = [];

  for (const block of blocks) {
    const { type, text, checked, children } = block;

    let line;
    if (type === 'bullet') {
      line = `${tab}- ${text}`;
    } else if (type === 'task') {
      line = `${tab}- [${checked ? 'x' : ' '}] ${text}`;
    } else if (/^heading(\d)$/.test(type)) {
      const level = parseInt(type.replace('heading', ''), 10);
      line = `${tab}${'#'.repeat(level)} ${text}`;
    } else {
      line = `${tab}${text}`;
    }

    lines.push(line);

    if (children && children.length) {
      lines.push(...blocksToMarkdown(children, indentLevel + 1));
    }
  }

  return lines;
}

async function parseToMarkdownCommand(app) {
  const activeFile = app.workspace.getActiveFile();
  if (!activeFile) {
    new Notice('No active file.');
    return;
  }

  const raw = await app.vault.read(activeFile);

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    new Notice('Active file is not valid JSON.');
    return;
  }

  if (!parsed.blocks || !Array.isArray(parsed.blocks)) {
    new Notice('JSON does not contain a "blocks" array.');
    return;
  }

  const lines = blocksToMarkdown(parsed.blocks, 0);
  const markdown = lines.join('\n');

  new ParseToMarkdownModal(app, markdown).open();
}

module.exports = { parseToMarkdownCommand };
