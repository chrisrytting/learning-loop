'use strict';

const { getEditorPromptText } = require('./promptText');

test('uses the selection when text is selected', () => {
  const editor = {
    getSelection: () => '  selected thought  ',
    getCursor: jest.fn(),
    getLine: jest.fn(),
  };
  expect(getEditorPromptText(editor)).toBe('selected thought');
});

test('otherwise uses the current line without its list marker', () => {
  const editor = {
    getSelection: () => '',
    getCursor: () => ({ line: 4 }),
    getLine: line => line === 4 ? "\t- I'm feeling stuck" : '',
  };
  expect(getEditorPromptText(editor)).toBe("I'm feeling stuck");
});
