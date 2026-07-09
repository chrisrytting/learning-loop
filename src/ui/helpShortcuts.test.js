'use strict';

const { registerHelpShortcuts } = require('./helpShortcuts');

function setup() {
  const handlers = new Map();
  const scope = {
    register: (modifiers, key, handler) => {
      handlers.set(`${modifiers.join('+')}:${key}`, handler);
    },
  };
  const actions = { brainstorm: jest.fn(), anotherQuestion: jest.fn() };
  registerHelpShortcuts(scope, actions);
  return { handlers, actions };
}

test('B starts brainstorming and Q tries another question', () => {
  const { handlers, actions } = setup();

  handlers.get(':b')({ target: { tagName: 'DIV' } });
  handlers.get(':q')({ target: { tagName: 'DIV' } });

  expect(actions.brainstorm).toHaveBeenCalledTimes(1);
  expect(actions.anotherQuestion).toHaveBeenCalledTimes(1);
});

test('brainstorm shortcuts do not fire while typing', () => {
  const { handlers, actions } = setup();

  expect(handlers.get(':b')({ target: { tagName: 'TEXTAREA' } })).toBeUndefined();
  expect(handlers.get(':q')({ target: { tagName: 'INPUT' } })).toBeUndefined();

  expect(actions.brainstorm).not.toHaveBeenCalled();
  expect(actions.anotherQuestion).not.toHaveBeenCalled();
});
