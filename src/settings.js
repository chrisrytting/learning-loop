'use strict';

/**
 * settings.js
 *
 * Plugin settings tab — API key and other configuration.
 */

const { PluginSettingTab, Setting, Notice } = require('obsidian');
const { FolderPickModal } = require('./ui/FolderPickModal');
const { normalizeBasePath, valuesFilePath } = require('./vault/values');
const { runSlackCheck } = require('./slack/scheduler');

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

    const basePath = normalizeBasePath(this.plugin.settings.basePathFolder);
    const valuesPath = valuesFilePath(basePath);

    new Setting(containerEl)
      .setName('Base path folder')
      .setDesc(`Vault folder containing Values.md (currently: ${valuesPath || 'Values.md'}).`)
      .addText(text => {
        text
          .setPlaceholder('e.g. Learning Loop')
          .setValue(basePath)
          .onChange(async (value) => {
            this.plugin.settings.basePathFolder = normalizeBasePath(value);
            await this.plugin.saveSettings();
          });
        return text;
      })
      .addButton(btn => btn
        .setButtonText('Choose folder')
        .onClick(() => {
          new FolderPickModal(this.app, async (folder) => {
            this.plugin.settings.basePathFolder = normalizeBasePath(folder);
            await this.plugin.saveSettings();
            this.display();
          }).open();
        }));

    // ── Slack ────────────────────────────────────────────────────────────────
    containerEl.createEl('h2', { text: 'Slack' });

    new Setting(containerEl)
      .setName('Slack Bot Token')
      .setDesc('OAuth bot token (xoxb-…). The bot needs channels:read, channels:history, groups:read, groups:history, users:read scopes.')
      .addText(text => text
        .setPlaceholder('xoxb-…')
        .setValue(this.plugin.settings.slackBotToken)
        .onChange(async (value) => {
          this.plugin.settings.slackBotToken = value.trim();
          await this.plugin.saveSettings();
        }));


    new Setting(containerEl)
      .setName('Message fetch limit')
      .setDesc('How many recent messages to fetch per check (1–200).')
      .addSlider(slider => slider
        .setLimits(1, 200, 1)
        .setValue(this.plugin.settings.slackMessageLimit ?? 50)
        .setDynamicTooltip()
        .onChange(async (value) => {
          this.plugin.settings.slackMessageLimit = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Check interval (minutes)')
      .setDesc('How often to fetch and evaluate new messages while Obsidian is open.')
      .addSlider(slider => slider
        .setLimits(1, 120, 1)
        .setValue(this.plugin.settings.slackCheckIntervalMinutes ?? 30)
        .setDynamicTooltip()
        .onChange(async (value) => {
          this.plugin.settings.slackCheckIntervalMinutes = value;
          await this.plugin.saveSettings();
          this.plugin._startSlackScheduler();
        }));

    new Setting(containerEl)
      .setName('Check now')
      .setDesc('Immediately fetch and evaluate new Slack messages.')
      .addButton(btn => btn
        .setButtonText('Run now')
        .onClick(async () => {
          const s = this.plugin.settings;
          if (!s.slackBotToken) {
            new Notice('Configure a Slack Bot Token first.');
            return;
          }
          try {
            const updated = await runSlackCheck(this.app, s, s.slackLastTs || '');
            if (updated !== s.slackLastTs) {
              s.slackLastTs = updated;
              await this.plugin.saveSettings();
            } else {
              new Notice('Learning Loop: no new Slack messages.');
            }
          } catch (e) {
            new Notice('Slack error: ' + e.message);
          }
        }));
  }
}

module.exports = LearningLoopSettingTab;
