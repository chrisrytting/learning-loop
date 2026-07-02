'use strict';

const { Modal, prepareFuzzySearch } = require('obsidian');

class AddPagesModal extends Modal {
  constructor(app, onInsert) {
    super(app);
    this.onInsert = onInsert;
    this.selected = new Set();
    this.query = '';
  }

  onOpen() {
    this.contentEl.empty();
    this.contentEl.addClass('ll-add-pages-modal');
    this.contentEl.createEl('h2', { text: 'Add pages' });

    this.searchInput = this.contentEl.createEl('input', {
      cls: 'll-add-pages-search',
      attr: { type: 'search', placeholder: 'Search pages…', 'aria-label': 'Search pages' },
    });
    this.searchInput.addEventListener('input', () => {
      this.query = this.searchInput.value;
      this.renderResults();
    });

    this.resultsEl = this.contentEl.createDiv({ cls: 'll-add-pages-results' });
    this.insertButton = this.contentEl.createEl('button', { text: 'Insert links', cls: 'mod-cta' });
    this.insertButton.disabled = true;
    this.insertButton.addEventListener('click', async () => {
      if (!this.selected.size) return;
      const files = this.app.vault.getMarkdownFiles().filter(file => this.selected.has(file.path));
      this.close();
      await this.onInsert(files);
    });

    this.renderResults();
    requestAnimationFrame(() => this.searchInput.focus());
  }

  getMatches() {
    const files = this.app.vault.getMarkdownFiles();
    if (!this.query.trim()) return files.slice(0, 50);
    const search = prepareFuzzySearch(this.query.trim());
    return files
      .map(file => ({ file, match: search(file.path.replace(/\.md$/i, '')) }))
      .filter(item => item.match)
      .sort((a, b) => b.match.score - a.match.score)
      .slice(0, 50)
      .map(item => item.file);
  }

  renderResults() {
    this.resultsEl.empty();
    const matches = this.getMatches();
    if (!matches.length) {
      this.resultsEl.createDiv({ text: 'No matching pages', cls: 'll-add-pages-empty' });
      return;
    }

    for (const file of matches) {
      const row = this.resultsEl.createEl('label', { cls: 'll-add-pages-result' });
      const checkbox = row.createEl('input', { attr: { type: 'checkbox' } });
      checkbox.checked = this.selected.has(file.path);
      const label = row.createDiv();
      label.createDiv({ text: file.basename, cls: 'll-add-pages-title' });
      if (file.parent?.path && file.parent.path !== '/') {
        label.createDiv({ text: file.parent.path, cls: 'll-add-pages-path' });
      }
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) this.selected.add(file.path);
        else this.selected.delete(file.path);
        this.insertButton.disabled = this.selected.size === 0;
        this.insertButton.setText(this.selected.size ? `Insert links (${this.selected.size})` : 'Insert links');
      });
    }
  }

  onClose() {
    this.contentEl.empty();
  }
}

module.exports = { AddPagesModal };
