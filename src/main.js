'use strict';

/**
 * main.js
 *
 * Plugin entry point — wiring only.
 * No business logic lives here. All logic is in commands/, ai/, vault/, ui/.
 */

const { Plugin } = require('obsidian');
const LearningLoopSettingTab = require('./settings');
const { helpCommand } = require('./commands/help');
const { logCommand } = require('./commands/log');
const { OptionsModal } = require('./ui/OptionsModal');

const DEFAULT_SETTINGS = {
  anthropicApiKey: '',
};

class LearningLoopPlugin extends Plugin {
  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  async onload() {
    await this.loadSettings();
    this.addSettingTab(new LearningLoopSettingTab(this.app, this));

    this.addRibbonIcon('repeat-2', 'Learning Loop: Options', () => {
      this.app.commands.executeCommandById('learning-loop:options');
    });

    // Primary entry point — opens the Options modal (Help vs Log chooser)
    this.addCommand({
      id: 'options',
      name: 'Options',
      icon: 'repeat-2',
      editorCallback: (editor) => new OptionsModal(this.app, editor, this.settings).open(),
    });

    // Direct commands still available for power users who know what they want
    this.addCommand({
      id: 'help',
      name: 'Help',
      editorCallback: (editor) => helpCommand(this.app, editor, this.settings),
    });

    this.addCommand({
      id: 'log',
      name: 'Log Problem / Solution',
      editorCallback: (editor) => logCommand(this.app, editor, this.settings),
    });
  }

  onunload() {}
}

module.exports = LearningLoopPlugin;
