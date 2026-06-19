'use strict';

/**
 * commands/help.js
 *
 * Reads the editor context, opens HelpModal
 */

const { HelpModal } = require('../ui/HelpModal');
const { readThought } = require('../vault/trace');

/**
 * @param {import('obsidian').App} app
 * @param {import('obsidian').Editor} editor
 * @param {{ anthropicApiKey: string }} settings
 */
async function helpCommand(app, editor, settings, plugin) {
  const thought = readThought(editor);
  const modal = new HelpModal(app, editor, settings, thought, plugin);
  modal.open();
}

module.exports = { helpCommand };
