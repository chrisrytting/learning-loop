'use strict';

/**
 * ui/OptionsModal.js
 *
 * Top-level entry point modal. Shows the two commands as large buttons with
 * short descriptions so new users know what each one does before picking.
 */

const { Modal } = require('obsidian');
const { helpCommand } = require('../commands/help');
const { logCommand } = require('../commands/log');

class OptionsModal extends Modal {
  /**
   * @param {import('obsidian').App} app
   * @param {import('obsidian').Editor} editor
   * @param {{ anthropicApiKey: string }} settings
   */
  constructor(app, editor, settings) {
    super(app);
    this.editor = editor;
    this.settings = settings;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('ll-options-modal');

    contentEl.createEl('h2', { text: 'Learning Loop' });

    const grid = contentEl.createDiv({ cls: 'll-options-grid' });

    // ── Help ──────────────────────────────────────────────────────────────
    const helpCard = grid.createDiv({ cls: 'll-option-card' });
    helpCard.createEl('h3', { text: 'Help' });
    helpCard.createEl('p', {
      text: "You're stuck or working through something right now. The plugin will identify the problem and surface relevant pages from your vault.",
    });
    const helpBtn = helpCard.createEl('button', { text: 'Get Help', cls: 'mod-cta' });
    helpBtn.addEventListener('click', () => {
      this.close();
      helpCommand(this.app, this.editor, this.settings);
    });

    // ── Log ───────────────────────────────────────────────────────────────
    const logCard = grid.createDiv({ cls: 'll-option-card' });
    logCard.createEl('h3', { text: 'Log' });
    logCard.createEl('p', {
      text: "You've noticed a pattern or just solved something. The plugin will parse out the problem and solution and file it in your Problems folder.",
    });
    const logBtn = logCard.createEl('button', { text: 'Log it', cls: 'mod-cta' });
    logBtn.addEventListener('click', () => {
      this.close();
      logCommand(this.app, this.editor, this.settings);
    });
  }

  onClose() {
    this.contentEl.empty();
  }
}

module.exports = { OptionsModal };
