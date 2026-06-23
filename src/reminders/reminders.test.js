'use strict';

const {
  parseWhen, parseBlock, parseInline, locateInlineLine, trailingInlineId,
} = require('./parse');

const NOW = 1_700_000_000_000;

describe('parseWhen', () => {
  test('relative minutes', () => {
    expect(parseWhen('in: 30m', NOW)).toEqual({ fireAt: NOW + 30 * 60000, label: 'in 30m' });
  });
  test('relative hours/days/seconds', () => {
    expect(parseWhen('in: 2h', NOW).fireAt).toBe(NOW + 2 * 3600000);
    expect(parseWhen('in: 1d', NOW).fireAt).toBe(NOW + 86400000);
    expect(parseWhen('in: 90s', NOW).fireAt).toBe(NOW + 90000);
  });
  test('case and spacing tolerant', () => {
    expect(parseWhen('IN : 5 m'.replace(' m', 'm'), NOW).fireAt).toBe(NOW + 5 * 60000);
  });
  test('absolute time', () => {
    const r = parseWhen('at: 2026-06-22 15:00', NOW);
    expect(r.fireAt).toBe(Date.parse('2026-06-22T15:00'));
    expect(r.label).toBe('at 2026-06-22 15:00');
  });
  test('non-directive lines return null', () => {
    expect(parseWhen('Revisit the flaky test', NOW)).toBeNull();
    expect(parseWhen('in: soon', NOW)).toBeNull();
    expect(parseWhen('in: 0m', NOW)).toBeNull();
  });
});

describe('parseBlock', () => {
  test('directive first line, body after', () => {
    const { when, body } = parseBlock('in: 30m\nRevisit the flaky test\nmore', NOW);
    expect(when.fireAt).toBe(NOW + 30 * 60000);
    expect(body).toBe('Revisit the flaky test\nmore');
  });
  test('no directive — all body', () => {
    const { when, body } = parseBlock('just a note', NOW);
    expect(when).toBeNull();
    expect(body).toBe('just a note');
  });
});

describe('parseInline', () => {
  test('relative with body', () => {
    const r = parseInline('@remind in:30m Revisit the flaky test', NOW);
    expect(r.when.fireAt).toBe(NOW + 30 * 60000);
    expect(r.body).toBe('Revisit the flaky test');
  });
  test('absolute ISO, no body', () => {
    const r = parseInline('@remind at:2026-06-22T15:00', NOW);
    expect(r.when.fireAt).toBe(Date.parse('2026-06-22T15:00'));
    expect(r.body).toBe('');
  });
  test('not a trigger / bad time', () => {
    expect(parseInline('just text', NOW)).toBeNull();
    expect(parseInline('@remind in:soon nope', NOW)).toBeNull();
  });
});

describe('locateInlineLine / trailingInlineId', () => {
  const lines = [
    '- [ ] first',
    '- [ ] do thing `@remind in:1h`',
    '    - nested',
    '- [ ] do thing `@remind in:1h`',
  ];
  test('finds nth occurrence within bounds', () => {
    expect(locateInlineLine(lines, 0, 3, '@remind in:1h', 0)).toBe(1);
    expect(locateInlineLine(lines, 0, 3, '@remind in:1h', 1)).toBe(3);
    expect(locateInlineLine(lines, 0, 3, '@remind in:1h', 2)).toBe(-1);
  });
  test('respects section bounds', () => {
    expect(locateInlineLine(lines, 2, 3, '@remind in:1h', 0)).toBe(3);
  });
  test('trailing id parsing', () => {
    expect(trailingInlineId('- [ ] task ^r123')).toBe('r123');
    expect(trailingInlineId('- [ ] task')).toBeNull();
  });
});
