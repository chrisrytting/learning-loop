'use strict';

/**
 * settings.js
 *
 * Plugin settings tab — API key and other configuration.
 */

const { PluginSettingTab, Setting } = require('obsidian');

class LearningLoopSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl('h2', { text: 'Learning Loop Settings' });

    new Setting(containerEl)
      .setName('Anthropic API key')
      .setDesc('Used for problem identification and AI search. Get one at console.anthropic.com.')
      .addText(text => text
        .setPlaceholder('sk-ant-…')
        .setValue(this.plugin.settings.anthropicApiKey)
        .onChange(async (value) => {
          this.plugin.settings.anthropicApiKey = value.trim();
          await this.plugin.saveSettings();
        }));
  }
}

module.exports = LearningLoopSettingTab;
