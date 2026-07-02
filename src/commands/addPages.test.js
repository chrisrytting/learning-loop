'use strict';

const { getLinePrefix, buildLinkInsertion } = require('./addPages');

describe('add pages insertion formatting', () => {
  test.each([
    ['  ', 2, '  '],
    ['- ', 2, '- '],
    ['\t- ', 3, '\t- '],
    ['1. ', 3, '1. '],
    ['> - ', 4, '> - '],
    ['- [ ] ', 6, '- [ ] '],
    ['some text', 4, ''],
  ])('gets a repeatable prefix from %p', (line, ch, expected) => {
    expect(getLinePrefix(line, ch)).toBe(expected);
  });

  test('puts every link on a sibling bullet', () => {
    expect(buildLinkInsertion(['[[One]]', '[[Two]]'], '\t- '))
      .toBe('[[One]]\n\t- [[Two]]');
  });
});
