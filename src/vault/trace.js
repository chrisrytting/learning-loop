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
 * @returns {{ text: string, fromLine: number, toLine: number, ch0: number, ch1: number }}
 */
function readThought(editor) {
  const hasSelection = editor.somethingSelected();
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

  const cursor = editor.getCursor();
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
 * Write a compact trace record into the note, replacing the original thought line(s).
 *
 * @param {import('obsidian').Editor} editor
 * @param {{
 *   fromLine: number,
 *   toLine: number,
 *   ch0: number,
 *   ch1: number,
 *   thought: string,
 *   problemName: string | null,
 *   retrievedPages: string[],
 * }} traceData
 */
function writeTrace(editor, traceData) {
  const { fromLine, toLine, ch1, thought, problemName, retrievedPages } = traceData;

  const lines = [];
  lines.push(`- [[Learning Loop Trace]] %% fold %%`);
  if (thought) lines.push(`\t- _${thought}_`);
  if (problemName) lines.push(`\t- [[${problemName}]]`);
  if (retrievedPages.length > 0) {
    lines.push('\t- ' + retrievedPages.map(p => `[[${p}]]`).join(', '));
  }

  const insertion = lines.join('\n');
  editor.replaceRange(insertion, { line: fromLine, ch: 0 }, { line: toLine, ch: ch1 });
  editor.setCursor({ line: fromLine + lines.length, ch: 0 });
}

function stripListMarker(text) {
  return text.replace(/^[\s\t]*[-*]?\s*/, '').trim();
}

module.exports = { readThought, writeTrace };
