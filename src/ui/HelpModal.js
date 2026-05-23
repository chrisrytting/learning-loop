'use strict';

/**
 * ui/HelpModal.js
 *
 * The primary UI for the Help command. Replaces the old inline trace state machine.
 *
 * Flow:
 *   Step 1 — Problem identification
 *     - Shows the user's thought (pre-filled from editor)
 *     - Calls identifyProblem() and shows the result
 *     - Buttons: [Accept] [Edit] [Skip]
 *
 *   Step 2 — Page retrieval (shown after Step 1 resolves)
 *     - Shows pages from "Retrieve Pages" frontmatter + AI search results
 *     - User can select which to keep, or dismiss
 *     - Button: [Done]
 *
 *   On close:
 *     - Calls writeTrace() to append a compact record to the note
 *     - Calls writeQueriesToPages() to index the cue text on selected pages
 */

const { Modal, Setting, Notice } = require('obsidian');
const { identifyProblem } = require('../ai/identifyProblem');
const { searchProblems } = require('../ai/searchProblems');
const { listProblemNames, buildQueryIndex, getRetrievePages, ensureProblemPage, writeQueriesToPages } = require('../vault/problems');
const { writeTrace } = require('../vault/trace');

class HelpModal extends Modal {
  /**
   * @param {import('obsidian').App} app
   * @param {import('obsidian').Editor} editor
   * @param {{ anthropicApiKey: string }} settings
   * @param {{ text: string, fromLine: number, toLine: number, ch0: number, ch1: number }} thought
   */
  constructor(app, editor, settings, thought) {
    super(app);
    this.editor = editor;
    this.settings = settings;
    this.thought = thought;

    // State built up through the steps
    this.problemName = null;       // resolved after Step 1
    this.selectedPages = [];       // resolved after Step 2
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('ll-help-modal');
    this.renderStep1();
  }

  // ─── Step 1: Problem identification ───────────────────────────────────────

  renderStep1() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl('h2', { text: 'What are you working through?' });

    // Show the thought text (read-only summary)
    if (this.thought.text) {
      contentEl.createEl('blockquote', { text: this.thought.text, cls: 'll-thought' });
    }

    const statusEl = contentEl.createEl('p', { text: 'Identifying problem…', cls: 'll-status' });
    const buttonRow = contentEl.createDiv({ cls: 'll-button-row' });

    // Run identification in background; render buttons when done
    this.runIdentification(statusEl, buttonRow);
  }

  async runIdentification(statusEl, buttonRow) {
    const apiKey = this.settings.anthropicApiKey;
    const existingNames = listProblemNames(this.app);

    try {
      const result = await identifyProblem(this.thought.text, existingNames, apiKey);
      this.renderStep1Result(result, statusEl, buttonRow);
    } catch (error) {
      statusEl.setText(`Error: ${error.message}`);
    }
  }

  renderStep1Result(result, statusEl, buttonRow) {
    buttonRow.empty();

    if (result.status === 'no-api-key') {
      statusEl.setText('Add an Anthropic API key in plugin settings to identify problems.');
      this.addSkipButton(buttonRow);
      return;
    }

    if (result.status === 'empty') {
      statusEl.setText('No thought text found — try selecting text or placing your cursor on a line.');
      this.addCloseButton(buttonRow, 'Close');
      return;
    }

    if (result.status === 'unidentified' || result.status === 'error') {
      statusEl.setText(
        result.status === 'error'
          ? `Could not identify problem: ${result.message}`
          : 'Could not identify a specific problem.'
      );
      this.addProblemInput(buttonRow, '');
      return;
    }

    // status === 'matched'
    const label = result.isNew
      ? `New problem: "${result.problemName}"`
      : `Problem: "${result.problemName}"`;
    statusEl.setText(label);

    // Accept button
    const acceptBtn = buttonRow.createEl('button', {
      text: result.isNew ? 'Create & accept' : 'Accept',
      cls: 'mod-cta',
    });
    acceptBtn.addEventListener('click', async () => {
      this.problemName = result.problemName;
      if (result.isNew) await ensureProblemPage(this.app, result.problemName);
      this.renderStep2();
    });

    // Edit button — lets user type a different name
    const editBtn = buttonRow.createEl('button', { text: 'Edit' });
    editBtn.addEventListener('click', () => {
      statusEl.empty();
      this.addProblemInput(buttonRow, result.problemName);
      editBtn.remove();
      acceptBtn.remove();
    });

    this.addSkipButton(buttonRow);
  }

  addProblemInput(buttonRow, initialValue) {
    const { contentEl } = this;
    const inputRow = contentEl.createDiv({ cls: 'll-input-row' });
    const input = inputRow.createEl('input', { type: 'text', value: initialValue, cls: 'll-problem-input' });
    input.placeholder = 'Problem name…';
    input.focus();

    const confirmBtn = inputRow.createEl('button', { text: 'Use this', cls: 'mod-cta' });
    confirmBtn.addEventListener('click', async () => {
      const name = input.value.trim();
      if (!name) { new Notice('Please enter a problem name.'); return; }
      this.problemName = name;
      await ensureProblemPage(this.app, name);
      inputRow.remove();
      buttonRow.empty();
      this.renderStep2();
    });

    this.addSkipButton(buttonRow);
  }

  addSkipButton(buttonRow) {
    const skipBtn = buttonRow.createEl('button', { text: 'Skip' });
    skipBtn.addEventListener('click', () => {
      this.problemName = null;
      this.renderStep2();
    });
  }

  addCloseButton(buttonRow, label = 'Close') {
    const btn = buttonRow.createEl('button', { text: label });
    btn.addEventListener('click', () => this.close());
  }

  // ─── Step 2: Page retrieval ────────────────────────────────────────────────

  async renderStep2() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl('h2', { text: 'Relevant pages' });

    const statusEl = contentEl.createEl('p', { text: 'Searching…', cls: 'll-status' });

    const apiKey = this.settings.anthropicApiKey;
    const mentionedNames = this.problemName ? [this.problemName] : [];
    const retrievePages = getRetrievePages(this.app, mentionedNames);
    const queryIndex = buildQueryIndex(this.app);
    const excludeNames = retrievePages.map(p => p.name);

    const { matches: aiMatches, warning } = await searchProblems(
      this.thought.text,
      queryIndex,
      excludeNames,
      apiKey,
    );

    const allPages = [
      ...retrievePages.map(p => ({ name: p.name, source: 'retrieve' })),
      ...aiMatches.map(name => ({ name, source: 'ai' })),
    ];

    statusEl.empty();

    if (allPages.length === 0 && !warning) {
      statusEl.setText('No related pages found.');
    } else {
      statusEl.setText('Select pages to include in the trace:');
    }

    if (warning) {
      contentEl.createEl('p', { text: warning, cls: 'll-warning' });
    }

    // Checkboxes for each page
    const selected = new Set(allPages.map(p => p.name)); // all selected by default
    for (const page of allPages) {
      new Setting(contentEl)
        .setName(`[[${page.name}]]`)
        .setDesc(page.source === 'ai' ? 'AI suggestion' : 'From "Retrieve Pages"')
        .addToggle(toggle => toggle
          .setValue(true)
          .onChange(v => {
            if (v) selected.add(page.name);
            else selected.delete(page.name);
          }));
    }

    // Done button
    const buttonRow = contentEl.createDiv({ cls: 'll-button-row' });
    const doneBtn = buttonRow.createEl('button', { text: 'Done', cls: 'mod-cta' });
    doneBtn.addEventListener('click', () => {
      this.selectedPages = [...selected];
      this.close();
    });

    const skipBtn = buttonRow.createEl('button', { text: 'Skip' });
    skipBtn.addEventListener('click', () => {
      this.selectedPages = [];
      this.close();
    });
  }

  // ─── On close: write the trace record ─────────────────────────────────────

  onClose() {
    const { contentEl } = this;
    contentEl.empty();

    // Write the compact trace to the note
    writeTrace(this.editor, {
      fromLine: this.thought.fromLine,
      toLine: this.thought.toLine,
      ch0: this.thought.ch0,
      ch1: this.thought.ch1,
      thought: this.thought.text,
      problemName: this.problemName,
      retrievedPages: this.selectedPages,
    });

    // Index the cue text on the selected pages
    if (this.thought.text && this.selectedPages.length > 0) {
      writeQueriesToPages(this.app, this.thought.text, this.selectedPages)
        .catch(err => console.warn('Learning Loop: failed to write queries', err));
    }
  }
}

module.exports = { HelpModal };
