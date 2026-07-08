'use strict';

/**
 * Return true when a list item belongs to a Related Solutions subtree.
 * `getLine` takes a one-based line number and returns its text.
 */
function isUnderRelatedSolutions(getLine, lineNumber, childIndent) {
  for (let number = lineNumber - 1; number >= 1; number--) {
    const text = getLine(number);
    if (!text.trim()) continue;
    const item = text.match(/^(\s*)[-*]\s+(.+?)\s*$/);
    if (!item) continue;
    const indent = item[1].length;
    if (indent >= childIndent) continue;
    return item[2] === 'Related Solutions';
  }
  return false;
}

module.exports = { isUnderRelatedSolutions };
