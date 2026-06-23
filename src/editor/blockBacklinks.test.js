'use strict';

jest.mock('@codemirror/view', () => ({
  ViewPlugin: { fromClass: jest.fn() },
  Decoration: {},
  WidgetType: class {},
}), { virtual: true });
jest.mock('@codemirror/state', () => ({ RangeSetBuilder: class {} }), { virtual: true });

const { BlockBacklinkIndex, parseBlockReference, wantsOpenRight } = require('./blockBacklinks');

describe('block backlinks', () => {
  test('parses a block link but ignores page and heading links', () => {
    expect(parseBlockReference('Daily Note#^abc123')).toEqual({
      linkpath: 'Daily Note',
      blockId: 'abc123',
    });
    expect(parseBlockReference('Daily Note')).toBeNull();
    expect(parseBlockReference('Daily Note#Heading')).toBeNull();
  });

  test('opens to the right only when Command and Option are both held', () => {
    expect(wantsOpenRight({ metaKey: true, altKey: true })).toBe(true);
    expect(wantsOpenRight({ metaKey: true, altKey: false })).toBe(false);
    expect(wantsOpenRight({ metaKey: false, altKey: true })).toBe(false);
  });

  test('indexes links and embeds by their exact destination block', () => {
    const sourceA = { path: 'Daily.md', basename: 'Daily' };
    const sourceB = { path: 'Problems/Stressed.md', basename: 'Stressed' };
    const target = { path: 'Daily.md', basename: 'Daily' };
    const caches = new Map([
      [sourceA, { links: [] }],
      [sourceB, {
        links: [{ link: 'Daily#^report1', position: { start: { line: 8, col: 4 } } }],
        embeds: [{ link: 'Daily#^report1', position: { start: { line: 9, col: 4 } } }],
      }],
    ]);
    const app = {
      vault: { getMarkdownFiles: () => [sourceA, sourceB] },
      metadataCache: {
        getFileCache: (file) => caches.get(file),
        getFirstLinkpathDest: (linkpath) => linkpath === 'Daily' ? target : null,
      },
    };

    const index = new BlockBacklinkIndex(app);
    index.rebuild();
    expect(index.get('Daily.md', 'report1')).toEqual([
      expect.objectContaining({ sourceFile: sourceB, line: 8, col: 4 }),
      expect.objectContaining({ sourceFile: sourceB, line: 9, col: 4 }),
    ]);
    expect(index.get('Daily.md', 'other')).toEqual([]);
  });
});
