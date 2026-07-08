'use strict';

const { registerOptionsShortcuts } = require('./optionsShortcuts');

test('h chooses Help and l chooses Log', () => {
  const handlers = {};
  const scope = {
    register: (_modifiers, key, handler) => { handlers[key] = handler; },
  };
  const actions = { help: jest.fn(), log: jest.fn() };

  registerOptionsShortcuts(scope, actions);
  expect(handlers.h()).toBe(false);
  expect(actions.help).toHaveBeenCalledTimes(1);
  expect(actions.log).not.toHaveBeenCalled();

  expect(handlers.l()).toBe(false);
  expect(actions.log).toHaveBeenCalledTimes(1);
});
