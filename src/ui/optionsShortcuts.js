'use strict';

function activeTarget(event) {
  return event?.target || globalThis.document?.activeElement || null;
}

function isTypingTarget(target) {
  const tag = target?.tagName?.toLowerCase();
  return tag === 'input' || tag === 'textarea' || target?.isContentEditable === true;
}

function registerOptionsShortcuts(scope, actions) {
  scope.register([], 'h', event => {
    if (isTypingTarget(activeTarget(event))) return undefined;
    actions.help();
    return false;
  });
  scope.register([], 'l', event => {
    if (isTypingTarget(activeTarget(event))) return undefined;
    actions.log();
    return false;
  });
  scope.register([], 'a', event => {
    if (isTypingTarget(activeTarget(event))) return undefined;
    actions.alpinePlus();
    return false;
  });
}

module.exports = { registerOptionsShortcuts };
