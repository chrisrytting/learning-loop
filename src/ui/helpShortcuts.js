'use strict';

function activeTarget(event) {
  return event?.target || globalThis.document?.activeElement || null;
}

function isTypingTarget(target) {
  const tag = target?.tagName?.toLowerCase();
  return tag === 'input' || tag === 'textarea' || target?.isContentEditable === true;
}

function registerHelpShortcuts(scope, actions) {
  scope.register([], 'b', event => {
    if (isTypingTarget(activeTarget(event))) return undefined;
    actions.brainstorm();
    return false;
  });

  scope.register([], 'q', event => {
    if (isTypingTarget(activeTarget(event))) return undefined;
    actions.anotherQuestion();
    return false;
  });
}

module.exports = { registerHelpShortcuts, isTypingTarget };
