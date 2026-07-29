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
const { compareToValuesCommand } = require('./commands/compareToValues');
const { parseToJsonCommand } = require('./commands/parseToJson');
const { parseToMarkdownCommand } = require('./commands/parseToMarkdown');
const { switchWorktreeCommand } = require('./commands/switchWorktree');
const { addPagesCommand } = require('./commands/addPages');
const { alpinePlusCommand } = require('./commands/alpinePlus');
const { registerSmartOpenRight } = require('./commands/smartOpenRight');
const { reportButtonExtension } = require('./editor/reportButton');
const { registerBlockBacklinks } = require('./editor/blockBacklinks');
const { registerReminders } = require('./reminders/reminders');
const { OptionsModal } = require('./ui/OptionsModal');
const { startSlackScheduler } = require('./slack/scheduler');
const { DEFAULT_BRAINSTORM_ANTHROPIC_MODEL } = require('./ai/brainstormSolution');
const { DEFAULT_PROJECT_GUIDE_ANTHROPIC_MODEL } = require('./ai/projectGuide');

const DEFAULT_SETTINGS = {
  aiProvider: 'anthropic',
  anthropicApiKey: '',
  brainstormAnthropicModel: DEFAULT_BRAINSTORM_ANTHROPIC_MODEL,
  projectGuideAnthropicModel: DEFAULT_PROJECT_GUIDE_ANTHROPIC_MODEL,
  ollamaBaseUrl: 'http://localhost:11434',
  ollamaModel: 'qwen3:latest',
  basePathFolder: '',
  slackBotToken: '',
  slackMessageLimit: 50,
  slackCheckIntervalMinutes: 30,
  slackLastTs: '',
  enableAiCache: false,
  logAiTranscripts: false,
  aiCache: {},
  reminders: [],
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

    this._startSlackScheduler();
    registerSmartOpenRight(this);
    registerReminders(this);

    // Renders a "＋ Report" button on each solution reference in a trace.
    this.registerEditorExtension(reportButtonExtension(this.app));

    // Shows exact, block-level backlinks beside any referenced ^block-id.
    registerBlockBacklinks(this);

    this.addRibbonIcon('repeat-2', 'Learning Loop: Options', () => {
      this.app.commands.executeCommandById('learning-loop:options');
    });

    // Primary entry point — opens the Options modal (Help vs Log chooser)
    this.addCommand({
      id: 'options',
      name: 'Options',
      icon: 'repeat-2',
      hotkeys: [{ modifiers: ['Mod'], key: 'l' }],
      editorCallback: (editor) => new OptionsModal(this.app, editor, this.settings, this).open(),
    });

    // Direct commands still available for power users who know what they want
    this.addCommand({
      id: 'help',
      name: 'Help',
      editorCallback: (editor) => helpCommand(this.app, editor, this.settings, this),
    });

    this.addCommand({
      id: 'log',
      name: 'Log Problem / Solution',
      editorCallback: (editor) => logCommand(this.app, editor, this.settings),
    });

    this.addCommand({
      id: 'add-pages',
      name: 'Add pages',
      editorCallback: (editor) => addPagesCommand(this.app, editor),
    });

    this.addCommand({
      id: 'alpine-plus',
      name: 'Alpine+ Guide',
      editorCallback: (editor) => alpinePlusCommand(this.app, editor, this.settings),
    });

    this.addCommand({
      id: 'compare-to-values',
      name: 'Compare to Values',
      editorCallback: (editor) => compareToValuesCommand(this.app, editor, this.settings, this),
    });

    this.addCommand({
      id: 'parse-to-json',
      name: 'Parse MD to JSON',
      callback: () => parseToJsonCommand(this.app),
    });

    this.addCommand({
      id: 'parse-to-markdown',
      name: 'Parse JSON to MD',
      callback: () => parseToMarkdownCommand(this.app),
    });

    this.addCommand({
      id: 'switch-worktree',
      name: 'Switch Worktree',
      callback: () => switchWorktreeCommand(this.app),
    });
  }

  _startSlackScheduler() {
    this._stopSlackScheduler?.();
    this._stopSlackScheduler = startSlackScheduler(
      this.app,
      this.settings,
      () => this.saveSettings(),
      this.settings.slackCheckIntervalMinutes,
    );
  }

  onunload() {
    this._stopSlackScheduler?.();
    this._reminderScheduler?.dispose();
  }
}

module.exports = LearningLoopPlugin;
