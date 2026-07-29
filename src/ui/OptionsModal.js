'use strict';

/**
 * ui/OptionsModal.js
 *
 * Top-level entry point modal. Shows the primary commands as large buttons with
 * short descriptions so new users know what each one does before picking.
 */

const { Modal } = require('obsidian');
const { helpCommand } = require('../commands/help');
const { logCommand } = require('../commands/log');
const { alpinePlusCommand } = require('../commands/alpinePlus');
const { registerOptionsShortcuts } = require('./optionsShortcuts');
const { getEditorPromptText } = require('./promptText');

class OptionsModal extends Modal {
  /**
   * @param {import('obsidian').App} app
   * @param {import('obsidian').Editor} editor
   * @param {{ anthropicApiKey: string }} settings
   */
  constructor(app, editor, settings, plugin = null) {
    super(app);
    this.editor = editor;
    this.settings = settings;
    this.plugin = plugin;
  }

  chooseHelp() {
    this.close();
    helpCommand(this.app, this.editor, this.settings, this.plugin);
  }

  chooseLog() {
    this.close();
    logCommand(this.app, this.editor, this.settings);
  }

  chooseAlpinePlus() {
    this.close();
    alpinePlusCommand(this.app, this.editor, this.settings);
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('ll-options-modal');

    // Single-key choices keep this lightweight modal fully keyboard-driven.
    // Modal's key scope is active only while the modal is open and is cleaned
    // up automatically when it closes.
    registerOptionsShortcuts(this.scope, {
      help: () => this.chooseHelp(),
      log: () => this.chooseLog(),
      alpinePlus: () => this.chooseAlpinePlus(),
    });

    contentEl.createEl('h2', { text: 'Learning Loop' });
    const promptText = getEditorPromptText(this.editor);
    if (promptText) {
      contentEl.createEl('blockquote', { text: promptText, cls: 'll-thought' });
    }

    const grid = contentEl.createDiv({ cls: 'll-options-grid' });

    // ── Help ──────────────────────────────────────────────────────────────
    const helpCard = grid.createDiv({ cls: 'll-option-card' });
    helpCard.createEl('h3', { text: 'Help' });
    helpCard.createEl('p', {
      text: "You're stuck or working through something right now. The plugin will identify the problem and surface relevant pages from your vault.",
    });
    const helpBtn = helpCard.createEl('button', { text: 'Get Help (H)', cls: 'mod-cta' });
    helpBtn.addEventListener('click', () => this.chooseHelp());

    // ── Log ───────────────────────────────────────────────────────────────
    const logCard = grid.createDiv({ cls: 'll-option-card' });
    logCard.createEl('h3', { text: 'Log' });
    logCard.createEl('p', {
      text: "You've noticed a pattern or just solved something. The plugin will parse out the problem and solution and file it in your Problems folder.",
    });
    const logBtn = logCard.createEl('button', { text: 'Log it (L)', cls: 'mod-cta' });
    logBtn.addEventListener('click', () => this.chooseLog());

    // ── Alpine+ ───────────────────────────────────────────────────────────
    const alpinePlusCard = grid.createDiv({ cls: 'll-option-card' });
    alpinePlusCard.createEl('h3', { text: 'Alpine+' });
    alpinePlusCard.createEl('p', {
      text: 'Ask the Alpine+ project guide what to do next, using your Goal, Roadmap, and Principles pages for context.',
    });
    const alpinePlusBtn = alpinePlusCard.createEl('button', {
      text: 'Open Alpine+ (A)',
      cls: 'mod-cta',
    });
    alpinePlusBtn.addEventListener('click', () => this.chooseAlpinePlus());
  }

  onClose() {
    this.contentEl.empty();
  }
}

module.exports = { OptionsModal };
