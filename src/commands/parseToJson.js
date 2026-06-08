'use strict';

const { ParseToJsonModal } = require('../ui/ParseToJsonModal');

function uuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function parseBlocks(lines, parentIndent) {
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const stripped = line.replace(/^\t+/, '');
    const indent = line.length - stripped.length;

    if (indent <= parentIndent) break;
    if (!stripped.trim()) { i++; continue; }

    let type, text, extra = {};
    if (stripped.startsWith('- [x] ')) {
      type = 'task'; text = stripped.slice(6); extra.checked = true;
    } else if (stripped.startsWith('- [ ] ')) {
      type = 'task'; text = stripped.slice(6); extra.checked = false;
    } else if (stripped.startsWith('- ')) {
      type = 'bullet'; text = stripped.slice(2);
    } else if (/^#{1,6} /.test(stripped)) {
      const level = stripped.match(/^(#+)/)[1].length;
      type = `heading${level}`; text = stripped.replace(/^#+\s*/, '');
    } else {
      type = 'paragraph'; text = stripped.trim();
    }

    // Collect child lines (deeper indent)
    const childLines = [];
    let j = i + 1;
    while (j < lines.length) {
      const nextStripped = lines[j].replace(/^\t+/, '');
      const nextIndent = lines[j].length - nextStripped.length;
      if (nextIndent > indent) { childLines.push(lines[j]); j++; }
      else break;
    }

    blocks.push({
      id: uuidv4(),
      type,
      text,
      ...extra,
      children: childLines.length ? parseBlocks(childLines, indent) : [],
    });

    i += 1 + childLines.length;
  }
  return blocks;
}

async function parseToJsonCommand(app) {
  const activeFile = app.workspace.getActiveFile();
  if (!activeFile) {
    new Notice('No active file.');
    return;
  }

  const content = await app.vault.read(activeFile);
  const { ctime, mtime } = activeFile.stat;

  const toIso = (ms) => new Date(ms).toISOString();
  const createdAt = toIso(ctime);
  const modifiedAt = toIso(mtime);

  const lines = content.split('\n');
  const rawBlocks = parseBlocks(lines, -1);

  // Stamp every block with file-level timestamps
  function stampBlocks(blocks) {
    for (const b of blocks) {
      b.created_at = createdAt;
      b.modified_at = modifiedAt;
      stampBlocks(b.children);
    }
  }
  stampBlocks(rawBlocks);

  const result = {
    file: activeFile.path,
    created_at: createdAt,
    modified_at: modifiedAt,
    blocks: rawBlocks,
  };

  new ParseToJsonModal(app, result).open();
}

module.exports = { parseToJsonCommand };
