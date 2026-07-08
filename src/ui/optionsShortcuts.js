'use strict';

function registerOptionsShortcuts(scope, actions) {
  scope.register([], 'h', () => {
    actions.help();
    return false;
  });
  scope.register([], 'l', () => {
    actions.log();
    return false;
  });
}

module.exports = { registerOptionsShortcuts };
