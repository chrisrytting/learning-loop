'use strict';

const { ensureExecutionBlockLink } = require('./executionLink');

function makeEditor(line) {
  const state = { line };
  return {
    state,
    getLine: () => state.line,
    replaceRange: (text, from) => {
      state.line = state.line.slice(0, from.ch) + text + state.line.slice(from.ch);
    },
  };
}

describe('ensureExecutionBlockLink', () => {
  const file = {
    path: '2026/07/2026-07-08-Wednesday.md',
    basename: '2026-07-08-Wednesday',
  };

  test('adds a block id and links to the original source line', () => {
    const editor = makeEditor("- I'm feeling fomo");
    const link = ensureExecutionBlockLink(editor, file, 0);

    const id = editor.state.line.match(/\^([a-z0-9]+)$/)[1];
    expect(link).toBe(`[[2026/07/2026-07-08-Wednesday#^${id}|2026-07-08-Wednesday]]`);
  });

  test('reuses an existing block id', () => {
    const editor = makeEditor("- I'm feeling fomo ^fomo12");

    expect(ensureExecutionBlockLink(editor, file, 0)).toBe(
      '[[2026/07/2026-07-08-Wednesday#^fomo12|2026-07-08-Wednesday]]'
    );
    expect(editor.state.line).toBe("- I'm feeling fomo ^fomo12");
  });
});
