'use strict';

/**
 * ui/ReportModal.js
 *
 * Small modal for reporting the outcome of having exercised a solution from a
 * Learning Loop Trace. The user types what happened when they applied the
 * solution; on save the text is handed back to the caller, which records it as
 * evidence nested under the solution reference in the note.
 */

const { Modal } = require('obsidian');

class ReportModal extends Modal {
  /**
   * @param {import('obsidian').App} app
   * @param {string} solutionLabel - the solution's display text, shown for context
   * @param {(report: string) => void} onSubmit - called with the trimmed report text
   */
  constructor(app, solutionLabel, onSubmit) {
    super(app);
    this.solutionLabel = solutionLabel;
    this.onSubmit = onSubmit;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('ll-report-modal');

    contentEl.createEl('h2', { text: 'Report a result', cls: 'll-report-heading' });
    if (this.solutionLabel) {
      contentEl.createEl('blockquote', { text: this.solutionLabel, cls: 'll-report-solution' });
    }
    contentEl.createEl('p', {
      text: 'What happened when you used this solution? Did it work? This gets recorded under the solution as evidence.',
      cls: 'll-report-hint',
    });

    const textarea = contentEl.createEl('textarea', { cls: 'll-report-input' });
    textarea.placeholder = 'e.g. Tried it on the deploy bug — fixed it in 5 minutes.';
    textarea.rows = 4;
    window.setTimeout(() => textarea.focus(), 0);

    const row = contentEl.createDiv({ cls: 'll-report-buttons' });
    const cancelBtn = row.createEl('button', { text: 'Cancel' });
    cancelBtn.addEventListener('click', () => this.close());

    const saveBtn = row.createEl('button', { text: 'Save report', cls: 'mod-cta' });
    const submit = () => {
      const text = textarea.value.trim();
      if (!text) return;
      this.onSubmit(text);
      this.close();
    };
    saveBtn.addEventListener('click', submit);

    // Cmd/Ctrl+Enter to save quickly.
    textarea.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        submit();
      }
    });
  }

  onClose() {
    this.contentEl.empty();
  }
}

module.exports = { ReportModal };
