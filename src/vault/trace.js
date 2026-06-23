'use strict';

/**
 * vault/trace.js
 *
 * Minimal read/write of the Learning Loop Trace structure in the active note.
 *
 * The trace is now just a compact record appended to the note after the user
 * finishes the Help conversation in the modal. The modal is the interface;
 * this file is the record-keeping layer.
 *
 * Trace format written to the note:
 *
 *   - [[Learning Loop Trace]] %% fold %%
 *     - [[Problem Name]]
 *     - [[Retrieved Page 1]], [[Retrieved Page 2]]
 *
 * The user's thought and AI conversation happen in the modal, not inline.
 */

/**
 * Read the text on the cursor line (or selection) to use as the initial thought.
 * Returns the stripped text and the editor range it came from.
 *
 * @param {import('obsidian').Editor} editor
 * @returns {{ text: string, fromLine: number, toLine: number, ch0: number, ch1: number,
 *   relatedProblems?: string[], relatedSolutions?: string[],
 *   relatedSolutionEntries?: Array<{ link: string, children: Array<{ depth: number, text: string }> }>,
 *   isExistingTrace?: boolean }}
 */
function readThought(editor) {
  const hasSelection = editor.somethingSelected();
  const cursor = hasSelection ? editor.getCursor('from') : editor.getCursor();
  const existingTrace = readExistingTrace(editor, cursor.line);
  if (existingTrace) return existingTrace;

  if (hasSelection) {
    const from = editor.getCursor('from');
    const to = editor.getCursor('to');
    return {
      text: editor.getSelection().trim(),
      fromLine: from.line,
      toLine: to.line,
      ch0: 0,
      ch1: editor.getLine(to.line).length,
    };
  }

  const text = editor.getLine(cursor.line);
  return {
    text: stripListMarker(text).trim(),
    fromLine: cursor.line,
    toLine: cursor.line,
    ch0: 0,
    ch1: text.length,
  };
}

/**
 * If the cursor is anywhere inside an existing trace, return that entire trace
 * as the editable range. This lets Help update the record instead of nesting a
 * second Learning Loop Trace beneath the cursor line.
 */
function readExistingTrace(editor, cursorLine) {
  const lineCount = editor.lineCount();

  for (let line = cursorLine; line >= 0; line -= 1) {
    const root = parseListItem(editor.getLine(line));
    if (!root || !/^\[\[Learning Loop Trace(?:\|[^\]]+)?\]\](?:\s+%%.*%%)?$/.test(root.text)) continue;

    let endLine = line;
    for (let candidate = line + 1; candidate < lineCount; candidate += 1) {
      const text = editor.getLine(candidate);
      if (text.trim() === '') break;
      const item = parseListItem(text);
      if (!item || item.indent <= root.indent) break;
      endLine = candidate;
    }
    if (cursorLine > endLine) continue;

    const trace = {
      text: '',
      fromLine: line,
      toLine: endLine,
      ch0: 0,
      ch1: editor.getLine(endLine).length,
      relatedProblems: [],
      relatedSolutions: [],
      relatedSolutionEntries: [],
      isExistingTrace: true,
    };

    let section = null;
    for (let candidate = line + 1; candidate <= endLine; candidate += 1) {
      const item = parseListItem(editor.getLine(candidate));
      if (!item) continue;

      if (item.text === 'Related Problems') {
        section = { name: 'relatedProblems', indent: item.indent, itemIndent: null };
      } else if (item.text === 'Related Solutions') {
        section = { name: 'relatedSolutions', indent: item.indent, itemIndent: null, currentEntry: null };
      } else if (section && item.indent > section.indent) {
        if (section.itemIndent === null) section.itemIndent = item.indent;

        if (item.indent === section.itemIndent) {
          trace[section.name].push(item.text);
          if (section.name === 'relatedSolutions') {
            section.currentEntry = { link: item.text, children: [] };
            trace.relatedSolutionEntries.push(section.currentEntry);
          }
        } else if (section.name === 'relatedSolutions' && section.currentEntry) {
          section.currentEntry.children.push({
            depth: Math.max(1, Math.ceil((item.indent - section.itemIndent) / 4)),
            text: item.text,
          });
        }
      } else {
        section = null;
        if (!trace.text) trace.text = item.text;
      }
    }
    return trace;
  }

  return null;
}

function parseListItem(line) {
  const match = /^(\s*)[-*]\s+(.*)$/.exec(line);
  if (!match) return null;
  return { indent: indentationWidth(match[1]), text: match[2].trim() };
}

function indentationWidth(whitespace) {
  return [...whitespace].reduce((width, char) => width + (char === '\t' ? 4 : 1), 0);
}

/**
 * Write a compact trace record into the note, replacing the original thought line(s).
 *
 * Each reference is a ready-to-write link string (e.g. "[[Page]]" or
 * "[[Page#^id|solution]]"). Page references are grouped under a "Related
 * Problems" heading, solution references under "Related Solutions".
 *
 * @param {import('obsidian').Editor} editor
 * @param {{
 *   fromLine: number,
 *   toLine: number,
 *   ch0: number,
 *   ch1: number,
 *   thought: string,
 *   relatedProblems: string[],
 *   relatedSolutions: string[],
 *   relatedSolutionEntries?: Array<{ link: string, children: Array<{ depth: number, text: string }> }>,
 * }} traceData
 */
function writeTrace(editor, traceData) {
  const {
    fromLine,
    toLine,
    ch1,
    thought,
    relatedProblems = [],
    relatedSolutions = [],
  } = traceData;
  const relatedSolutionEntries = traceData.relatedSolutionEntries?.length
    ? traceData.relatedSolutionEntries
    : relatedSolutions.map(link => ({ link, children: [] }));

  const lines = [];
  lines.push(`- [[Learning Loop Trace]]`);
  if (thought) lines.push(`\t- ${thought}`);

  const section = (heading, refs) => {
    if (refs.length === 0) return;
    lines.push(`\t- ${heading}`);
    for (const ref of refs) lines.push(`\t\t- ${ref}`);
  };
  section('Related Problems', relatedProblems);
  if (relatedSolutionEntries.length > 0) {
    lines.push(`\t- Related Solutions`);
    for (const entry of relatedSolutionEntries) {
      lines.push(`\t\t- ${entry.link}`);
      for (const child of entry.children || []) {
        lines.push(`\t\t${'\t'.repeat(child.depth)}- ${child.text}`);
      }
    }
  }

  const insertion = lines.join('\n');
  editor.replaceRange(insertion, { line: fromLine, ch: 0 }, { line: toLine, ch: ch1 });
  editor.setCursor({ line: fromLine + lines.length, ch: 0 });
}

function stripListMarker(text) {
  return text.replace(/^[\s\t]*[-*]?\s*/, '').trim();
}

module.exports = { readThought, writeTrace };
