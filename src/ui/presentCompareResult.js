'use strict';

/**
 * ui/presentCompareResult.js
 *
 * Presentation layer for compare-to-values results. Swap this module to change
 * how results are shown (modal today; file write or notice later).
 */

const { CompareValuesModal } = require('./CompareValuesModal');

/**
 * @param {import('obsidian').App} app
 * @param {import('./CompareValuesModal').CompareResultPayload} payload
 */
function presentCompareResult(app, payload) {
  new CompareValuesModal(app, payload).open();
}

module.exports = { presentCompareResult };
