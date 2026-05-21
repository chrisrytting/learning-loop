'use strict';

const { normalizePath } = require('obsidian');

const SYNCED_FILES_DIR = 'Learning Loop Instructions';

function getSyncedFilesPath() {
  return normalizePath(this.manifest.dir + '/' + SYNCED_FILES_DIR);
}

async function syncVaultFiles() {
  const adapter = this.app.vault.adapter;
  const syncDir = this.getSyncedFilesPath();

  if (!await adapter.exists(syncDir)) return;

  const listing = await adapter.list(syncDir);
  this._syncedFileNames = new Set();

  const vaultDir = normalizePath(SYNCED_FILES_DIR);
  if (!await adapter.exists(vaultDir)) {
    await adapter.mkdir(vaultDir);
  }

  for (const pluginFilePath of listing.files) {
    const fileName = pluginFilePath.split('/').pop();
    this._syncedFileNames.add(fileName);
    const vaultFilePath = normalizePath(SYNCED_FILES_DIR + '/' + fileName);

    const pluginStat = await adapter.stat(pluginFilePath);
    const vaultExists = await adapter.exists(vaultFilePath);

    if (!vaultExists) {
      const content = await adapter.read(pluginFilePath);
      await adapter.write(vaultFilePath, content);
    } else {
      const vaultStat = await adapter.stat(vaultFilePath);
      if (pluginStat.mtime > vaultStat.mtime) {
        const content = await adapter.read(pluginFilePath);
        await adapter.write(vaultFilePath, content);
      } else if (vaultStat.mtime > pluginStat.mtime) {
        const content = await adapter.read(vaultFilePath);
        await adapter.write(pluginFilePath, content);
      }
    }
  }

  this._syncHandler = this.app.vault.on('modify', async (file) => {
    if (file.parent?.path === SYNCED_FILES_DIR && this._syncedFileNames.has(file.name)) {
      const pluginFilePath = normalizePath(syncDir + '/' + file.name);
      const content = await adapter.read(file.path);
      await adapter.write(pluginFilePath, content);
    }
  });
  this.registerEvent(this._syncHandler);
}

module.exports = {
  getSyncedFilesPath,
  syncVaultFiles,
};
