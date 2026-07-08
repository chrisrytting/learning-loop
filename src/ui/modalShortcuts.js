'use strict';

function activeTarget(event) {
  return event?.target || globalThis.document?.activeElement || null;
}

function isInputLike(target) {
  const tag = target?.tagName?.toLowerCase();
  return tag === 'input' || tag === 'textarea' || target?.isContentEditable === true;
}

function isNativeActionControl(target) {
  const tag = target?.tagName?.toLowerCase();
  return tag === 'button' || tag === 'a' || tag === 'select';
}

function isMultiline(target) {
  const tag = target?.tagName?.toLowerCase();
  return tag === 'textarea' || target?.isContentEditable === true;
}

/** Register the standard keyboard-first modal actions on an Obsidian key scope. */
function registerModalShortcuts(scope, actions, options = {}) {
  const { enterInSingleLineInput = true } = options;

  scope.register([], 'Enter', event => {
    const target = activeTarget(event);
    if (isNativeActionControl(target)) return undefined;
    if (isMultiline(target)) return undefined;
    if (!enterInSingleLineInput && isInputLike(target)) return undefined;
    actions.primary();
    return false;
  });

  scope.register(['Mod'], 'Enter', () => {
    actions.primary();
    return false;
  });

  scope.register([], 'Escape', () => {
    actions.cancel();
    return false;
  });
}

module.exports = { registerModalShortcuts };
