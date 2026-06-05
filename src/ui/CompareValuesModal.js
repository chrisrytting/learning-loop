'use strict';

/**
 * ui/CompareValuesModal.js
 *
 * Shows alignment score and rationale, or setup / error states.
 */

const { Modal } = require('obsidian');

/**
 * @typedef {Object} CompareResultPayload
 * @property {'result' | 'setup' | 'loading' | 'error'} mode
 * @property {string} [actionText]
 * @property {number} [alignmentScore]
 * @property {string} [rationale]
 * @property {string} [message]
 * @property {string} [valuesPath]
 * @property {() => void} [onOpenSettings]
 * @property {() => void | Promise<void>} [onOpenValues]
 */

class CompareValuesModal extends Modal {
  /**
   * @param {import('obsidian').App} app
   * @param {CompareResultPayload} payload
   */
  constructor(app, payload) {
    super(app);
    this.payload = payload;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('ll-compare-modal');
    this.enableTextSelection();

    const { mode } = this.payload;

    if (mode === 'loading') {
      contentEl.createEl('h2', { text: 'Compare to Values' });
      contentEl.createEl('p', { text: 'Evaluating alignment…', cls: 'll-status' });
      if (this.payload.actionText) {
        contentEl.createEl('blockquote', { text: this.payload.actionText, cls: 'll-thought' });
      }
      return;
    }

    if (mode === 'setup') {
      contentEl.createEl('h2', { text: 'Compare to Values' });
      contentEl.createEl('p', {
        text: this.payload.message || 'Configure a base-path folder in Learning Loop settings, then edit Values.md in that folder.',
      });
      const row = contentEl.createDiv({ cls: 'll-button-row' });
      if (this.payload.onOpenSettings) {
        row.createEl('button', { text: 'Open settings', cls: 'mod-cta' })
          .addEventListener('click', () => {
            this.close();
            this.payload.onOpenSettings();
          });
      }
      if (this.payload.onOpenValues) {
        row.createEl('button', { text: 'Open Values.md' })
          .addEventListener('click', async () => {
            await this.payload.onOpenValues();
          });
      }
      row.createEl('button', { text: 'Close' })
        .addEventListener('click', () => this.close());
      return;
    }

    if (mode === 'error') {
      contentEl.createEl('h2', { text: 'Compare to Values' });
      contentEl.createEl('p', { text: this.payload.message || 'Something went wrong.', cls: 'll-warning' });
      if (this.payload.actionText) {
        contentEl.createEl('blockquote', { text: this.payload.actionText, cls: 'll-thought' });
      }
      const row = contentEl.createDiv({ cls: 'll-button-row' });
      if (this.payload.onOpenValues) {
        row.createEl('button', { text: 'Open Values.md' })
          .addEventListener('click', async () => {
            await this.payload.onOpenValues();
          });
      }
      row.createEl('button', { text: 'Close' })
        .addEventListener('click', () => this.close());
      return;
    }

    // mode === 'result'
    contentEl.createEl('h2', { text: 'Compare to Values' });
    if (this.payload.actionText) {
      contentEl.createEl('blockquote', { text: this.payload.actionText, cls: 'll-thought' });
    }

    const scoreEl = contentEl.createDiv({ cls: 'll-alignment-score' });
    scoreEl.createEl('span', { text: String(this.payload.alignmentScore), cls: 'll-score-number' });
    scoreEl.createEl('span', { text: ' / 100 alignment', cls: 'll-score-label' });

    contentEl.createEl('p', { text: this.payload.rationale || '', cls: 'll-rationale' });

    const row = contentEl.createDiv({ cls: 'll-button-row' });
    if (this.payload.onOpenValues) {
      row.createEl('button', { text: 'Edit values' })
        .addEventListener('click', async () => {
          await this.payload.onOpenValues();
        });
    }
    row.createEl('button', { text: 'Close', cls: 'mod-cta' })
      .addEventListener('click', () => this.close());
  }

  /**
   * Editor commands leave CodeMirror focused; without this, drag-to-select
   * targets the note behind the modal instead of the evaluation text.
   */
  enableTextSelection() {
    const { contentEl } = this;
    contentEl.setAttr('tabindex', '-1');

    this._focusContent = () => contentEl.focus();
    contentEl.addEventListener('mousedown', this._focusContent);

    window.requestAnimationFrame(() => contentEl.focus());
  }

  onClose() {
    if (this._focusContent) {
      this.contentEl.removeEventListener('mousedown', this._focusContent);
      this._focusContent = null;
    }
    this.contentEl.empty();
  }
}

module.exports = { CompareValuesModal };
