'use strict';

const { Modal } = require('obsidian');

class ParseToMarkdownModal extends Modal {
  constructor(app, markdown) {
    super(app);
    this.markdown = markdown;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('ll-parse-json-modal');

    contentEl.createEl('h2', { text: 'Parse JSON to MD' });

    const pre = contentEl.createEl('pre', { cls: 'll-parse-json-pre' });
    pre.createEl('code', { text: this.markdown });

    const row = contentEl.createDiv({ cls: 'll-button-row' });
    row.createEl('button', { text: 'Copy', cls: 'mod-cta' })
      .addEventListener('click', () => {
        navigator.clipboard.writeText(this.markdown);
      });
    row.createEl('button', { text: 'Close' })
      .addEventListener('click', () => this.close());
  }

  onClose() {
    this.contentEl.empty();
  }
}

module.exports = { ParseToMarkdownModal };
