'use strict';

jest.mock('../ai/parseLogEntry', () => ({
  parseLogEntry: jest.fn(),
}));

jest.mock('../vault/problems', () => ({
  readProblemFiles: jest.fn(),
  writeProblemLog: jest.fn(),
}));

jest.mock('../vault/logs', () => ({
  writeCommandUsageLog: jest.fn(),
}));

jest.mock('../ui/LogConfirmModal', () => ({
  LogConfirmModal: class {
    constructor(app, parsed, onSubmit) {
      this.onSubmit = onSubmit;
    }

    open() {
      this.onSubmit({ problem: 'FOMO', solutions: [] });
    }
  },
}));

const { logCommand } = require('./log');
const { parseLogEntry } = require('../ai/parseLogEntry');
const { readProblemFiles, writeProblemLog } = require('../vault/problems');

function makeEditor(content, cursorLine = 0) {
  const state = { lines: content.split('\n'), cursor: { line: cursorLine, ch: 0 } };
  return {
    state,
    somethingSelected: () => false,
    getSelection: () => '',
    getCursor: () => state.cursor,
    getLine: line => state.lines[line],
    lineCount: () => state.lines.length,
    replaceRange: (replacement, from, to = from) => {
      if (to.line === from.line && to.ch === from.ch) {
        state.lines[from.line] =
          state.lines[from.line].slice(0, from.ch) +
          replacement +
          state.lines[from.line].slice(from.ch);
        return;
      }
      state.lines.splice(from.line, to.line - from.line + 1, ...replacement.split('\n'));
    },
    setCursor: cursor => { state.cursor = cursor; },
  };
}

describe('logCommand', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    readProblemFiles.mockResolvedValue([]);
    parseLogEntry.mockResolvedValue({
      problem: 'FOMO',
      problemCandidates: [],
      solutions: [],
      instanceDetail: "I'm feeling fomo",
      confidence: 0.9,
    });
    writeProblemLog.mockResolvedValue();
  });

  test('turns the logged line into its own trace even when another trace is directly below it', async () => {
    const editor = makeEditor([
      "- I'm feeling fomo ^8456mn",
      '- [[Learning Loop Trace]]',
      "\t- I'm feeling left out ^cjbu9v",
      '\t- Related Problems',
      '\t\t- [[FOMO]]',
      '\t\t- [[Feeling Left Out]]',
    ].join('\n'));
    const app = {
      workspace: { getActiveFile: () => ({ path: '2026/07/2026-07-08-Wednesday.md', basename: '2026-07-08-Wednesday' }) },
      metadataCache: { getFileCache: () => ({}) },
    };

    await logCommand(app, editor, {});
    await Promise.resolve();

    expect(writeProblemLog).toHaveBeenCalledWith(app, {
      problem: 'FOMO',
      solutions: [],
      instanceLink: '[[2026/07/2026-07-08-Wednesday#^8456mn|2026-07-08-Wednesday]]',
    });
    expect(editor.state.lines.join('\n')).toBe([
      '- [[Learning Loop Trace]]',
      "\t- I'm feeling fomo ^8456mn",
      '\t- Related Problems',
      '\t\t- [[FOMO]]',
      '- [[Learning Loop Trace]]',
      "\t- I'm feeling left out ^cjbu9v",
      '\t- Related Problems',
      '\t\t- [[FOMO]]',
      '\t\t- [[Feeling Left Out]]',
    ].join('\n'));
  });
});
