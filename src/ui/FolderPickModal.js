'use strict';

/**
 * ui/FolderPickModal.js
 *
 * Simple vault folder picker for settings.
 */

const { Modal } = require('obsidian');

/**
 * @param {import('obsidian').App} app
 * @returns {string[]}
 */
function listVaultFolders(app) {
  const folders = new Set(['']);
  for (const file of app.vault.getAllLoadedFiles()) {
    const parent = file.parent;
    if (parent?.path) folders.add(parent.path);
  }
  return Array.from(folders).sort((a, b) => {
    if (a === '') return -1;
    if (b === '') return 1;
    return a.localeCompare(b);
  });
}

class FolderPickModal extends Modal {
  /**
   * @param {import('obsidian').App} app
   * @param {(folderPath: string) => void} onPick
   */
  constructor(app, onPick) {
    super(app);
    this.onPick = onPick;
    this.folders = listVaultFolders(app);
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl('h2', { text: 'Choose base-path folder' });

    const filter = contentEl.createEl('input', {
      type: 'text',
      placeholder: 'Filter folders…',
    });
    filter.classList.add('ll-folder-filter');

    const listEl = contentEl.createDiv({ cls: 'll-folder-list' });

    const render = (query) => {
      listEl.empty();
      const q = query.trim().toLowerCase();
      const matches = this.folders.filter(f => {
        const label = f || '(vault root)';
        return !q || label.toLowerCase().includes(q);
      });

      if (matches.length === 0) {
        listEl.createEl('p', { text: 'No folders match.' });
        return;
      }

      for (const folder of matches) {
        const label = folder || '(vault root)';
        const btn = listEl.createEl('button', { text: label, cls: 'll-folder-option' });
        btn.addEventListener('click', () => {
          this.onPick(folder);
          this.close();
        });
      }
    };

    filter.addEventListener('input', () => render(filter.value));
    render('');
    filter.focus();
  }

  onClose() {
    this.contentEl.empty();
  }
}

module.exports = { FolderPickModal, listVaultFolders };
