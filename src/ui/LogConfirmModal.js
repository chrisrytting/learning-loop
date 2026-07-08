'use strict';

/**
 * ui/LogConfirmModal.js
 *
 * Shown after parseLogEntry() runs, before writing to Problems/.
 * Displays parsed problem and solution fields in editable form,
 * and lets the user confirm, edit, or cancel.
 *
 * Usage:
 *   const modal = new LogConfirmModal(app, parsed, (confirmed) => {
 *     if (confirmed) writeProblemLog(app, confirmed);
 *   });
 *   modal.open();
 */

const { Modal, Setting, Notice } = require('obsidian');
const { registerModalShortcuts } = require('./modalShortcuts');
const { registerProblemCandidateShortcuts } = require('./problemCandidateShortcuts');

class LogConfirmModal extends Modal {
  /**
   * @param {import('obsidian').App} app
   * @param {{ problem: string, problemCandidates?: Array<{name: string, confidence: number}>,
   *   solutions: string[], instanceDetail: string, confidence: number }} parsed
   * @param {(confirmed: { problem: string, solutions: string[] } | null) => void} onSubmit
   */
  constructor(app, parsed, onSubmit) {
    super(app);
    this.parsed = parsed;
    this.onSubmit = onSubmit;

    // Editable copies of the parsed fields
    this.problem = parsed.problem;
    this.problemCandidates = parsed.problemCandidates || [];
    this.selectedProblemIndex = 0;
    this.problemChoiceElements = [];
    this.solutions = [...parsed.solutions];
    this.submitted = false;
  }

  submit() {
    const selectedProblem = this.selectedProblemIndex === 0
      ? this.problem.trim()
      : this.problemCandidates[this.selectedProblemIndex - 1]?.name;
    if (!selectedProblem) {
      new Notice('Please enter a problem name.');
      return;
    }
    this.submitted = true;
    this.onSubmit({
      problem: selectedProblem,
      solutions: this.solutions,
    });
    this.close();
  }

  cancel() {
    if (!this.submitted) this.onSubmit(null);
    this.close();
  }

  selectProblem(index) {
    if (index < 0 || index > this.problemCandidates.length) return;
    this.selectedProblemIndex = index;
    this.problemChoiceElements.forEach((choice, choiceIndex) => {
      const selected = choiceIndex === index;
      choice.row.classList.toggle('is-selected', selected);
      choice.action.setAttribute('aria-pressed', String(selected));
    });
  }

  chooseProblem(index) {
    this.selectProblem(index);
    this.submit();
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('ll-log-confirm-modal');
    contentEl.createEl('h2', { text: 'Log Problem / Solution' });
    if (this.parsed.instanceDetail) {
      contentEl.createEl('blockquote', { text: this.parsed.instanceDetail, cls: 'll-thought' });
    }
    registerModalShortcuts(this.scope, {
      primary: () => this.submit(),
      cancel: () => this.cancel(),
    });
    registerProblemCandidateShortcuts(
      this.scope,
      1 + this.problemCandidates.length,
      index => this.chooseProblem(index),
    );

    if (this.parsed.confidence < 0.5) {
      contentEl.createEl('p', {
        text: '⚠ Low confidence — please review and fill in the fields below.',
        cls: 'll-warning',
      });
    }

    this.renderProblemChoices(contentEl);

    // Solutions field (newline-separated for now, one per solution)
    new Setting(contentEl)
      .setName('Solutions')
      .setDesc('Optional. One possible solution per line.')
      .addTextArea(area => area
        .setPlaceholder('e.g. Take a break\nTurn off notifications')
        .setValue(this.solutions.join('\n'))
        .onChange(v => {
          this.solutions = v.split('\n').map(s => s.trim()).filter(Boolean);
        }));

    // Buttons
    const buttonRow = contentEl.createDiv({ cls: 'll-button-row' });

    const cancelBtn = buttonRow.createEl('button', { text: 'Cancel (Esc)' });
    cancelBtn.addEventListener('click', () => this.cancel());

    const confirmBtn = buttonRow.createEl('button', { text: 'Log it (Enter)', cls: 'mod-cta' });
    confirmBtn.addEventListener('click', () => this.submit());
  }

  renderProblemChoices(contentEl) {
    contentEl.createEl('h3', { text: 'Which problem does this belong to?' });
    const choices = contentEl.createDiv({ cls: 'll-problem-choices' });

    const createRow = choices.createDiv({ cls: 'll-problem-choice is-new is-selected' });
    const createAction = createRow.createEl('button', {
      text: '(1) Create new:',
      cls: 'll-problem-choice-action',
    });
    createAction.setAttribute('aria-pressed', 'true');
    this.problemChoiceElements.push({ row: createRow, action: createAction });
    const createInput = createRow.createEl('input', { type: 'text', cls: 'll-new-problem-input' });
    createInput.value = this.problem;
    createInput.placeholder = 'New problem name';
    createRow.addEventListener('click', event => {
      if (event.target !== createInput) this.chooseProblem(0);
    });
    createInput.addEventListener('focus', () => this.selectProblem(0));
    createInput.addEventListener('input', () => { this.problem = createInput.value; });

    this.problemCandidates.forEach((candidate, index) => {
      const choiceIndex = index + 1;
      const row = choices.createDiv({ cls: 'll-problem-choice is-existing' });
      const action = row.createEl('button', {
        text: `(${choiceIndex + 1}) ${candidate.name}`,
        cls: 'll-problem-choice-action',
      });
      action.setAttribute('aria-pressed', 'false');
      this.problemChoiceElements.push({ row, action });
      row.createSpan({ text: 'existing', cls: 'll-existing-badge' });
      row.addEventListener('click', () => this.chooseProblem(choiceIndex));
    });
  }

  onClose() {
    this.contentEl.empty();
  }
}

module.exports = { LogConfirmModal };
