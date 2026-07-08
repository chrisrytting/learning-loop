'use strict';

const { registerModalShortcuts } = require('./modalShortcuts');

function setup(options) {
  const handlers = new Map();
  const scope = {
    register: (modifiers, key, handler) => {
      handlers.set(`${modifiers.join('+')}:${key}`, handler);
    },
  };
  const actions = { primary: jest.fn(), cancel: jest.fn() };
  registerModalShortcuts(scope, actions, options);
  return { handlers, actions };
}

test('Enter confirms and Escape cancels', () => {
  const { handlers, actions } = setup();
  handlers.get(':Enter')({ target: { tagName: 'DIV' } });
  handlers.get(':Escape')();
  expect(actions.primary).toHaveBeenCalledTimes(1);
  expect(actions.cancel).toHaveBeenCalledTimes(1);
});

test('Enter leaves focused buttons to their native action', () => {
  const { handlers, actions } = setup();
  expect(handlers.get(':Enter')({ target: { tagName: 'BUTTON' } })).toBeUndefined();
  expect(actions.primary).not.toHaveBeenCalled();
});

test('textarea Enter inserts a newline while Mod+Enter confirms', () => {
  const { handlers, actions } = setup();
  expect(handlers.get(':Enter')({ target: { tagName: 'TEXTAREA' } })).toBeUndefined();
  expect(actions.primary).not.toHaveBeenCalled();
  handlers.get('Mod:Enter')({ target: { tagName: 'TEXTAREA' } });
  expect(actions.primary).toHaveBeenCalledTimes(1);
});

test('a contextual single-line input can retain Enter', () => {
  const { handlers, actions } = setup({ enterInSingleLineInput: false });
  expect(handlers.get(':Enter')({ target: { tagName: 'INPUT' } })).toBeUndefined();
  expect(actions.primary).not.toHaveBeenCalled();
});
