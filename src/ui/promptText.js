'use strict';

function getEditorPromptText(editor) {
  const selected = editor.getSelection();
  if (selected.trim()) return selected.trim();
  const line = editor.getLine(editor.getCursor().line);
  return line.replace(/^[\s\t]*[-*]?\s*/, '').trim();
}

module.exports = { getEditorPromptText };
