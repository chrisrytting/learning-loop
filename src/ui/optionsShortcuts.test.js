'use strict';

const { registerOptionsShortcuts } = require('./optionsShortcuts');

function setup() {
  const handlers = new Map();
  const scope = {
    register: (modifiers, key, handler) => {
      handlers.set(`${modifiers.join('+')}:${key}`, handler);
    },
  };
  const actions = { help: jest.fn(), log: jest.fn(), alpinePlus: jest.fn() };
  registerOptionsShortcuts(scope, actions);
  return { handlers, actions };
}

test('H chooses Help, L chooses Log, and A chooses Alpine+', () => {
  const { handlers, actions } = setup();

  expect(handlers.get(':h')({ target: { tagName: 'DIV' } })).toBe(false);
  expect(handlers.get(':l')({ target: { tagName: 'DIV' } })).toBe(false);
  expect(handlers.get(':a')({ target: { tagName: 'DIV' } })).toBe(false);

  expect(actions.help).toHaveBeenCalledTimes(1);
  expect(actions.log).toHaveBeenCalledTimes(1);
  expect(actions.alpinePlus).toHaveBeenCalledTimes(1);
});

test('option shortcuts do not fire while typing', () => {
  const { handlers, actions } = setup();

  expect(handlers.get(':h')({ target: { tagName: 'INPUT' } })).toBeUndefined();
  expect(handlers.get(':l')({ target: { tagName: 'TEXTAREA' } })).toBeUndefined();
  expect(handlers.get(':a')({ target: { isContentEditable: true } })).toBeUndefined();

  expect(actions.help).not.toHaveBeenCalled();
  expect(actions.log).not.toHaveBeenCalled();
  expect(actions.alpinePlus).not.toHaveBeenCalled();
});
