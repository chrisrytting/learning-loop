'use strict';

/**
 * commands/help.js
 *
 * Entry point for the Help command. Thin dispatcher — reads the editor context,
 * opens HelpModal, and gets out of the way.
 */

const { HelpModal } = require('../ui/HelpModal');
const { readThought } = require('../vault/trace');

/**
 * @param {import('obsidian').App} app
 * @param {import('obsidian').Editor} editor
 * @param {{ anthropicApiKey: string }} settings
 */
async function helpCommand(app, editor, settings) {
  const thought = readThought(editor);

  if (!thought.text) {
    // Nothing on the line — let the modal open anyway so the user can type
  }

  const modal = new HelpModal(app, editor, settings, thought);
  modal.open();
}

module.exports = { helpCommand };
