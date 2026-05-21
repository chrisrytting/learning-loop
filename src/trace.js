'use strict';

function findTraceBlock(editor, cursorLine) {
  const totalLines = editor.lineCount();
  for (let i = cursorLine - 1; i >= 0; i--) {
    const line = editor.getLine(i);
    if (line.length === 0 || line.match(/^\s/)) continue;
    if (!line.trim().startsWith('- [[Learning Loop Trace]]')) return null;
    const blockStart = i;
    let blockEnd = blockStart;
    for (let j = blockStart + 1; j < totalLines; j++) {
      const bline = editor.getLine(j);
      if (bline.length > 0 && !bline.match(/^\s/)) break;
      if (bline.trim()) blockEnd = j;
    }
    return cursorLine <= blockEnd ? { blockStart, blockEnd } : null;
  }
  return null;
}

function findTraceSections(editor, blockStart, blockEnd) {
  let thoughtLineIdx = -1;
  let responseLineIdx = -1;
  let llOutputLineIdx = -1;
  let reviewLineIdx = -1;
  for (let i = blockStart + 1; i <= blockEnd; i++) {
    const lineText = editor.getLine(i).trim();
    if (lineText === '- User Thought / Feeling') thoughtLineIdx = i;
    if (lineText === '- User Response') responseLineIdx = i;
    if (lineText === '- Learning Loop Output') llOutputLineIdx = i;
    if (lineText === '- Review') reviewLineIdx = i;
  }
  return { thoughtLineIdx, responseLineIdx, llOutputLineIdx, reviewLineIdx };
}

function extractCueText(editor, thoughtLineIdx, responseLineIdx, llOutputLineIdx) {
  const thoughtIndentLen = editor.getLine(thoughtLineIdx).match(/^(\s*)/)[1].length;
  const thoughtEndLine = responseLineIdx !== -1 ? responseLineIdx - 1 : llOutputLineIdx - 1;
  let cue = '';
  for (let i = thoughtLineIdx + 1; i <= thoughtEndLine; i++) {
    const line = editor.getLine(i);
    if (!line.trim()) continue;
    if (line.match(/^(\s*)/)[1].length <= thoughtIndentLen) break;
    cue += ' ' + line.replace(/^[\s\t]*-\s*/, '');
  }
  return cue.trim();
}

function createTraceFromSelection(editor) {
  const from = editor.getCursor('from');
  const to = editor.getCursor('to');
  const selection = editor.getSelection();
  const thoughtLines = selection.trim().split('\n').filter(l => l.trim());
  const thoughtContent = thoughtLines.map(l => '\t\t- ' + l.replace(/^[\s\t]*[-*]?\s*/, '')).join('\n');
  const traceInsertion = '- [[Learning Loop Trace]] %% fold %%\n\t- User Thought / Feeling\n' + thoughtContent + '\n\t- User Response\n\t\t- ';
  editor.replaceRange(traceInsertion, { line: from.line, ch: 0 }, { line: to.line, ch: editor.getLine(to.line).length });
  const responseLine = from.line + 2 + thoughtLines.length + 1;
  editor.setCursor({ line: responseLine, ch: '\t\t- '.length });
  this.enterInsertMode(editor);
}

function createTrace(editor, cursorLine) {
  const insertion = '- [[Learning Loop Trace]] %% fold %%\n\t- User Thought / Feeling\n\t\t- ';
  const lineLen = editor.getLine(cursorLine).length;
  editor.replaceRange(insertion, { line: cursorLine, ch: 0 }, { line: cursorLine, ch: lineLen });
  editor.setCursor({ line: cursorLine + 2, ch: '\t\t- '.length });
  this.enterInsertMode(editor);
}

function createTraceFromLine(editor, cursor, thoughtText) {
  const traceInsertion = '- [[Learning Loop Trace]] %% fold %%\n\t- User Thought / Feeling\n\t\t- ' + thoughtText + '\n\t- User Response\n\t\t- ';
  const lineLen = editor.getLine(cursor.line).length;
  editor.replaceRange(traceInsertion, { line: cursor.line, ch: 0 }, { line: cursor.line, ch: lineLen });
  editor.setCursor({ line: cursor.line + 4, ch: '\t\t- '.length });
  this.enterInsertMode(editor);
}

function addResponse(editor, blockEnd) {
  const insertion = '\n\t- User Response\n\t\t- ';
  const lineLen = editor.getLine(blockEnd).length;
  editor.replaceRange(insertion, { line: blockEnd, ch: lineLen });
  editor.setCursor({ line: blockEnd + 2, ch: '\t\t- '.length });
  this.enterInsertMode(editor);
}

async function runRetrieval(editor, thoughtLineIdx, responseLineIdx, blockEnd) {
  const thoughtIndentLen = editor.getLine(thoughtLineIdx).match(/^(\s*)/)[1].length;
  let cueText = '';
  for (let i = thoughtLineIdx + 1; i <= blockEnd; i++) {
    const line = editor.getLine(i);
    if (!line.trim()) continue;
    if (line.match(/^(\s*)/)[1].length <= thoughtIndentLen) break;
    cueText += ' ' + line.replace(/^[\s\t]*-\s*/, '');
  }
  cueText = cueText.trim();
  if (!cueText) return;

  const mentionedLinks = [
    ...this.extractLinks(editor, thoughtLineIdx, responseLineIdx - 1),
    ...this.extractLinks(editor, responseLineIdx, blockEnd),
  ];

  await this.insertSearchResults(editor, mentionedLinks, cueText, blockEnd);
}

async function indexCues(editor, blockStart, blockEnd, thoughtLineIdx, responseLineIdx, llOutputLineIdx) {
  if (thoughtLineIdx !== -1 && llOutputLineIdx !== -1) {
    const cueText = this.extractCueText(editor, thoughtLineIdx, responseLineIdx, llOutputLineIdx);
    if (cueText) {
      const allTracePages = this.extractLinks(editor, blockStart, blockEnd);
      const uniquePages = [...new Set(allTracePages)];
      if (uniquePages.length > 0) {
        await this.writeQueriesToPages(cueText, uniquePages);
      }
    }
  }

  const lineLen = editor.getLine(blockEnd).length;
  editor.replaceRange('\n', { line: blockEnd, ch: lineLen });
  editor.setCursor({ line: blockEnd + 1, ch: 0 });
  this.enterInsertMode(editor);
}

module.exports = {
  findTraceBlock,
  findTraceSections,
  extractCueText,
  createTraceFromSelection,
  createTrace,
  createTraceFromLine,
  addResponse,
  runRetrieval,
  indexCues,
};
