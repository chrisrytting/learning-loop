'use strict';

const { Modal } = require('obsidian');

class ParseToJsonModal extends Modal {
  constructor(app, json) {
    super(app);
    this.json = json;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('ll-parse-json-modal');

    contentEl.createEl('h2', { text: 'Parse to JSON' });

    const pre = contentEl.createEl('pre', { cls: 'll-parse-json-pre' });
    pre.createEl('code', { text: JSON.stringify(this.json, null, 2) });

    const row = contentEl.createDiv({ cls: 'll-button-row' });
    row.createEl('button', { text: 'Copy', cls: 'mod-cta' })
      .addEventListener('click', () => {
        navigator.clipboard.writeText(JSON.stringify(this.json, null, 2));
      });
    row.createEl('button', { text: 'Close' })
      .addEventListener('click', () => this.close());
  }

  onClose() {
    this.contentEl.empty();
  }
}

module.exports = { ParseToJsonModal };
