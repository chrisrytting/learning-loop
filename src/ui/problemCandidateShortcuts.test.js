'use strict';

const { registerProblemCandidateShortcuts } = require('./problemCandidateShortcuts');

test('number keys select candidates unless the user is typing', () => {
  const handlers = {};
  const scope = { register: (_mods, key, handler) => { handlers[key] = handler; } };
  const select = jest.fn();
  registerProblemCandidateShortcuts(scope, 3, select);

  handlers['2']({ target: { tagName: 'DIV' } });
  expect(select).toHaveBeenCalledWith(1);

  handlers['1']({ target: { tagName: 'INPUT', classList: { contains: () => false } } });
  expect(select).toHaveBeenCalledTimes(1);

  handlers['1']({
    target: { tagName: 'INPUT', classList: { contains: cls => cls === 'll-new-problem-input' } },
  });
  expect(select).toHaveBeenLastCalledWith(0);
});
