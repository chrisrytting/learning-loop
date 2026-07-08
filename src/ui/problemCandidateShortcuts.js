'use strict';

function shouldPreserveNumberInput(event) {
  const target = event?.target || globalThis.document?.activeElement;
  const tag = target?.tagName?.toLowerCase();
  if (tag === 'textarea' || target?.isContentEditable === true) return true;
  if (tag !== 'input') return false;
  return !target.classList?.contains('ll-new-problem-input');
}

function registerProblemCandidateShortcuts(scope, count, select) {
  for (let index = 0; index < Math.min(count, 9); index++) {
    scope.register([], String(index + 1), event => {
      if (shouldPreserveNumberInput(event)) return undefined;
      select(index);
      return false;
    });
  }
}

module.exports = { registerProblemCandidateShortcuts };
