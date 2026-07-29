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
const { formatFireAt } = require('./reminders/reminders');
const { DEFAULT_BRAINSTORM_ANTHROPIC_MODEL } = require('./ai/brainstormSolution');
const {
  DEFAULT_PROJECT_GUIDE_ANTHROPIC_MODEL,
  PROJECT_GUIDE_ANTHROPIC_MODELS,
} = require('./ai/projectGuide');

class LearningLoopSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl('h2', { text: 'Learning Loop Settings' });

    // ── AI Provider ──────────────────────────────────────────────────────────
    containerEl.createEl('h2', { text: 'AI Provider' });

    new Setting(containerEl)
      .setName('AI provider')
      .setDesc('Choose which AI backend to use for all analysis.')
      .addDropdown(drop => drop
        .addOption('anthropic', 'Anthropic (Claude)')
        .addOption('ollama', 'Ollama (local)')
        .setValue(this.plugin.settings.aiProvider || 'anthropic')
        .onChange(async (value) => {
          this.plugin.settings.aiProvider = value;
          await this.plugin.saveSettings();
          this.display();
        }));

    if ((this.plugin.settings.aiProvider || 'anthropic') === 'anthropic') {
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

      new Setting(containerEl)
        .setName('Brainstorming model')
        .setDesc('Claude model used to turn brainstorm interview answers into candidate solutions.')
        .addText(text => text
          .setPlaceholder(DEFAULT_BRAINSTORM_ANTHROPIC_MODEL)
          .setValue(this.plugin.settings.brainstormAnthropicModel || DEFAULT_BRAINSTORM_ANTHROPIC_MODEL)
          .onChange(async (value) => {
            this.plugin.settings.brainstormAnthropicModel = value.trim() || DEFAULT_BRAINSTORM_ANTHROPIC_MODEL;
            await this.plugin.saveSettings();
          }));

      new Setting(containerEl)
        .setName('Project Guide model')
        .setDesc('Claude model used to create project pages and answer project-guide cues such as Alpine+.')
        .addDropdown(drop => {
          for (const model of PROJECT_GUIDE_ANTHROPIC_MODELS) {
            drop.addOption(model.id, model.label);
          }
          return drop
            .setValue(this.plugin.settings.projectGuideAnthropicModel || DEFAULT_PROJECT_GUIDE_ANTHROPIC_MODEL)
            .onChange(async (value) => {
              this.plugin.settings.projectGuideAnthropicModel = value || DEFAULT_PROJECT_GUIDE_ANTHROPIC_MODEL;
              await this.plugin.saveSettings();
            });
        });
    }

    if (this.plugin.settings.aiProvider === 'ollama') {
      new Setting(containerEl)
        .setName('Ollama base URL')
        .setDesc('Base URL of your local Ollama server.')
        .addText(text => text
          .setPlaceholder('http://localhost:11434')
          .setValue(this.plugin.settings.ollamaBaseUrl || 'http://localhost:11434')
          .onChange(async (value) => {
            this.plugin.settings.ollamaBaseUrl = value.trim();
            await this.plugin.saveSettings();
          }));

      new Setting(containerEl)
        .setName('Ollama model')
        .setDesc('Model name to use. Examples: qwen3:latest, qwen3:8b, gemma3:latest.')
        .addText(text => text
          .setPlaceholder('qwen3:latest')
          .setValue(this.plugin.settings.ollamaModel || 'qwen3:latest')
          .onChange(async (value) => {
            this.plugin.settings.ollamaModel = value.trim();
            await this.plugin.saveSettings();
          }));
    }

    // ── Base Directory ───────────────────────────────────────────────────────
    containerEl.createEl('h2', { text: 'Base Directory' });

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

    // ── Reminders ────────────────────────────────────────────────────────────
    containerEl.createEl('h2', { text: 'Reminders' });

    const scheduler = this.plugin._reminderScheduler;
    const reminders = [...(this.plugin.settings.reminders || [])].sort(
      (a, b) => a.fireAt - b.fireAt,
    );

    if (!reminders.length) {
      containerEl.createEl('p', {
        text: 'No pending reminders. Add a `learning-loop-reminder` code block to a note to set one.',
        cls: 'setting-item-description',
      });
    } else {
      for (const r of reminders) {
        const overdue = r.fireAt <= Date.now();
        new Setting(containerEl)
          .setName(r.body || 'Reminder')
          .setDesc(`${overdue ? 'Overdue — ' : ''}${formatFireAt(r.fireAt)} · ${r.path}`)
          .addButton(btn => btn
            .setButtonText('Open')
            .onClick(() => {
              const link = r.blockId ? `${r.path}#^${r.blockId}` : r.path;
              this.app.workspace.openLinkText(link, '', false);
            }))
          .addButton(btn => btn
            .setButtonText('Cancel')
            .setWarning()
            .onClick(async () => {
              if (scheduler) {
                await scheduler.remove(r.id);
              } else {
                this.plugin.settings.reminders =
                  (this.plugin.settings.reminders || []).filter(x => x.id !== r.id);
                await this.plugin.saveSettings();
              }
              this.display();
            }));
      }
    }

    // ── Dev ──────────────────────────────────────────────────────────────────
    containerEl.createEl('h2', { text: 'Dev' });

    new Setting(containerEl)
      .setName('Log raw AI prompts and responses')
      .setDesc('Off by default. When enabled, command logs include the full prompt and text response for every AI call. Prompts may contain private vault content and can make Logs files large.')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.logAiTranscripts ?? false)
        .onChange(async (value) => {
          this.plugin.settings.logAiTranscripts = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Cache AI responses')
      .setDesc('Reuse AI results when the same utterance and problem list are seen again. Saves API cost during development.')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.enableAiCache ?? false)
        .onChange(async (value) => {
          this.plugin.settings.enableAiCache = value;
          await this.plugin.saveSettings();
        }));

    const cacheSize = Object.keys(this.plugin.settings.aiCache ?? {}).length;
    new Setting(containerEl)
      .setName('Clear AI cache')
      .setDesc(`${cacheSize} entr${cacheSize === 1 ? 'y' : 'ies'} currently cached.`)
      .addButton(btn => btn
        .setButtonText('Clear')
        .onClick(async () => {
          this.plugin.settings.aiCache = {};
          await this.plugin.saveSettings();
          new Notice('Learning Loop: AI cache cleared.');
          this.display();
        }));
  }
}

module.exports = LearningLoopSettingTab;
