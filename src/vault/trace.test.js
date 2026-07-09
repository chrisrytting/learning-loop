'use strict';

const { readThought, writeTrace } = require('./trace');

function makeEditor(content, cursorLine) {
  const state = { lines: content.split('\n'), cursor: { line: cursorLine, ch: 0 } };
  return {
    state,
    somethingSelected: () => false,
    getCursor: () => state.cursor,
    getLine: line => state.lines[line],
    lineCount: () => state.lines.length,
    replaceRange: (replacement, from, to) => {
      state.lines.splice(from.line, to.line - from.line + 1, ...replacement.split('\n'));
    },
    setCursor: cursor => { state.cursor = cursor; },
  };
}

describe('Learning Loop traces', () => {
  test('reads an existing trace as one editable block from a nested thought', () => {
    const editor = makeEditor([
      '- [[Learning Loop Trace]]',
      '\t- I\'m stressed',
      '\t- Related Problems',
      '\t\t- [[Stressed]]',
    ].join('\n'), 1);

    expect(readThought(editor)).toEqual({
      text: "I'm stressed",
      fromLine: 0,
      toLine: 3,
      ch0: 0,
      ch1: 16,
      relatedProblems: ['[[Stressed]]'],
      relatedSolutions: [],
      relatedSolutionEntries: [],
      isExistingTrace: true,
    });
  });

  test('keeps reports nested under their solution when adding another solution', () => {
    const editor = makeEditor([
      '- [[Learning Loop Trace]]',
      '\t- I\'m stressed',
      '\t- Related Problems',
      '\t\t- [[Stressed]]',
      '\t- Related Solutions',
      '\t\t- [[Stressed#^acm3rr|Talk to a friend]]',
      '\t\t\t- I think this went super well ^dxzh07',
    ].join('\n'), 6);
    const thought = readThought(editor);

    expect(thought.relatedSolutions).toEqual(['[[Stressed#^acm3rr|Talk to a friend]]']);
    expect(thought.relatedSolutionEntries).toEqual([{
      link: '[[Stressed#^acm3rr|Talk to a friend]]',
      children: [{ depth: 1, text: 'I think this went super well ^dxzh07' }],
    }]);

    writeTrace(editor, {
      ...thought,
      thought: thought.text,
      relatedSolutionEntries: [
        ...thought.relatedSolutionEntries,
        { link: '[[Stressed#^0uqy32|Body scan]]', children: [] },
      ],
    });

    expect(editor.state.lines.join('\n')).toBe([
      '- [[Learning Loop Trace]]',
      '\t- I\'m stressed',
      '\t- Related Problems',
      '\t\t- [[Stressed]]',
      '\t- Related Solutions',
      '\t\t- [[Stressed#^acm3rr|Talk to a friend]]',
      '\t\t\t- I think this went super well ^dxzh07',
      '\t\t- [[Stressed#^0uqy32|Body scan]]',
      '',
    ].join('\n'));
    // Cursor lands past the trace, not on the new solution's own line, so
    // its Report button (which hides on the active line) is visible.
    expect(editor.state.cursor).toEqual({ line: 8, ch: 0 });
  });

  test('updates an existing trace without inserting a duplicate header', () => {
    const editor = makeEditor([
      '- [[Learning Loop Trace]]',
      '\t- I\'m stressed',
      '\t- Related Problems',
      '\t\t- [[Stressed]]',
    ].join('\n'), 1);
    const thought = readThought(editor);

    writeTrace(editor, {
      ...thought,
      thought: thought.text,
      relatedSolutions: ['[[Stressed#^0uqy32|Body scan]]'],
    });

    expect(editor.state.lines.join('\n')).toBe([
      '- [[Learning Loop Trace]]',
      '\t- I\'m stressed',
      '\t- Related Problems',
      '\t\t- [[Stressed]]',
      '\t- Related Solutions',
      '\t\t- [[Stressed#^0uqy32|Body scan]]',
      '',
    ].join('\n'));
    expect(editor.state.lines.filter(line => line.includes('[[Learning Loop Trace]]'))).toHaveLength(1);
  });

  test('does not grow the note with another blank line on a repeat edit', () => {
    const editor = makeEditor([
      '- [[Learning Loop Trace]]',
      '\t- I\'m stressed',
      '\t- Related Problems',
      '\t\t- [[Stressed]]',
      '',
    ].join('\n'), 1);
    const thought = readThought(editor);

    writeTrace(editor, {
      ...thought,
      thought: thought.text,
      relatedSolutions: ['[[Stressed#^0uqy32|Body scan]]'],
    });

    expect(editor.state.lines.join('\n')).toBe([
      '- [[Learning Loop Trace]]',
      '\t- I\'m stressed',
      '\t- Related Problems',
      '\t\t- [[Stressed]]',
      '\t- Related Solutions',
      '\t\t- [[Stressed#^0uqy32|Body scan]]',
      '',
    ].join('\n'));
  });

  test('still reads a normal list item as a new thought', () => {
    const editor = makeEditor('- A normal thought', 0);
    expect(readThought(editor)).toEqual({
      text: 'A normal thought',
      fromLine: 0,
      toLine: 0,
      ch0: 0,
      ch1: 18,
    });
  });
});
