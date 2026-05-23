'use strict';

/**
 * ui/LogConfirmModal.js
 *
 * Shown after parseLogEntry() runs, before writing to Problems/.
 * Displays parsed fields (problem, solutions, instanceDetail) in editable form,
 * and lets the user confirm, edit, or cancel.
 *
 * Usage:
 *   const modal = new LogConfirmModal(app, parsed, (confirmed) => {
 *     if (confirmed) writeProblemLog(app, confirmed);
 *   });
 *   modal.open();
 */

const { Modal, Setting, Notice } = require('obsidian');

class LogConfirmModal extends Modal {
  /**
   * @param {import('obsidian').App} app
   * @param {{ problem: string, solutions: string[], instanceDetail: string, confidence: number }} parsed
   * @param {(confirmed: { problem: string, solutions: string[], instanceDetail: string } | null) => void} onSubmit
   */
  constructor(app, parsed, onSubmit) {
    super(app);
    this.parsed = parsed;
    this.onSubmit = onSubmit;

    // Editable copies of the parsed fields
    this.problem = parsed.problem;
    this.solutions = [...parsed.solutions];
    this.instanceDetail = parsed.instanceDetail;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl('h2', { text: 'Log Problem / Solution' });

    if (this.parsed.confidence < 0.5) {
      contentEl.createEl('p', {
        text: '⚠ Low confidence — please review and fill in the fields below.',
        cls: 'll-warning',
      });
    }

    // Problem name field
    new Setting(contentEl)
      .setName('Problem')
      .setDesc('The difficulty or symptom (becomes the Problems/ file name).')
      .addText(text => text
        .setPlaceholder('e.g. Staying Focused')
        .setValue(this.problem)
        .onChange(v => { this.problem = v; }));

    // Solutions field (newline-separated for now, one per solution)
    new Setting(contentEl)
      .setName('Solutions')
      .setDesc('One solution per line.')
      .addTextArea(area => area
        .setPlaceholder('e.g. Take a break\nTurn off notifications')
        .setValue(this.solutions.join('\n'))
        .onChange(v => {
          this.solutions = v.split('\n').map(s => s.trim()).filter(Boolean);
        }));

    // Instance detail field
    new Setting(contentEl)
      .setName('Instance detail')
      .setDesc('The original note text — kept verbatim in the problem log.')
      .addText(text => text
        .setValue(this.instanceDetail)
        .onChange(v => { this.instanceDetail = v; }));

    // Buttons
    const buttonRow = contentEl.createDiv({ cls: 'll-button-row' });

    const cancelBtn = buttonRow.createEl('button', { text: 'Cancel' });
    cancelBtn.addEventListener('click', () => {
      this.onSubmit(null);
      this.close();
    });

    const confirmBtn = buttonRow.createEl('button', { text: 'Log it', cls: 'mod-cta' });
    confirmBtn.addEventListener('click', () => {
      if (!this.problem.trim()) {
        new Notice('Please enter a problem name.');
        return;
      }
      if (this.solutions.length === 0) {
        new Notice('Please enter at least one solution.');
        return;
      }
      this.onSubmit({
        problem: this.problem.trim(),
        solutions: this.solutions,
        instanceDetail: this.instanceDetail,
      });
      this.close();
    });
  }

  onClose() {
    this.contentEl.empty();
  }
}

module.exports = { LogConfirmModal };
