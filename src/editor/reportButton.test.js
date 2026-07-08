'use strict';

const { isUnderRelatedSolutions } = require('./reportButtonSections');

function documentLines(lines) {
  return number => lines[number - 1];
}

describe('report button section detection', () => {
  test('accepts a block reference nested under Related Solutions', () => {
    const getLine = documentLines([
      '- Thought',
      '\t- Related Solutions',
      '\t\t- [[Fomo#^abc123|Remember 4000 Weeks]]',
    ]);

    expect(isUnderRelatedSolutions(getLine, 3, 2)).toBe(true);
  });

  test('rejects an instance block reference', () => {
    const getLine = documentLines([
      '- Solutions',
      '\t- Remember 4000 Weeks',
      '- Instances',
      '\t- [[Daily#^abc123|Daily]] ![[Daily#^abc123]]',
    ]);

    expect(isUnderRelatedSolutions(getLine, 4, 1)).toBe(false);
  });
});
