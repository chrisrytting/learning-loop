'use strict';

const { PluginSettingTab, Setting } = require('obsidian');

class LearningLoopSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    new Setting(containerEl)
      .setName('Anthropic API key')
      .setDesc('Used for AI-powered page recommendations in LL output. Get a key at console.anthropic.com.')
      .addText(text => text
        .setPlaceholder('sk-ant-...')
        .setValue(this.plugin.settings.anthropicApiKey)
        .onChange(async (value) => {
          this.plugin.settings.anthropicApiKey = value.trim();
          await this.plugin.saveSettings();
        }));
    new Setting(containerEl)
      .setName('Smart open on Cmd+Opt+Click')
      .setDesc('When enabled, Cmd+Opt+clicking an internal link opens it using smart open right (max 2 panes).')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.smartOpenOnCmdClick)
        .onChange(async (value) => {
          this.plugin.settings.smartOpenOnCmdClick = value;
          await this.plugin.saveSettings();
          if (value) this.plugin.setupCmdClickHandler();
          else this.plugin.teardownCmdClickHandler();
        }));
  }
}

module.exports = LearningLoopSettingTab;
