'use strict';

const path = require('path');
const { WorktreeSwitchModal } = require('../ui/WorktreeSwitchModal');

/**
 * Opens a modal listing all git worktrees for this plugin repo.
 * Selecting one atomically re-points the vault's plugin symlink to that worktree.
 *
 * @param {import('obsidian').App} app
 */
function findMainGitDir(worktreePath) {
  const fs = require('fs');
  const gitEntry = path.join(worktreePath, '.git');
  const stat = fs.statSync(gitEntry);
  if (stat.isDirectory()) {
    // This is already the main worktree
    return gitEntry;
  }
  // Linked worktree: .git is a file like "gitdir: /path/to/.git/worktrees/name"
  const contents = fs.readFileSync(gitEntry, 'utf8').trim();
  const match = contents.match(/^gitdir:\s*(.+)$/);
  if (!match) throw new Error('Unexpected .git file format');
  const metaDir = path.resolve(worktreePath, match[1]);
  const commondir = fs.readFileSync(path.join(metaDir, 'commondir'), 'utf8').trim();
  return path.resolve(metaDir, commondir);
}

function switchWorktreeCommand(app) {
  const fs = require('fs');
  const vaultBase = app.vault.adapter.basePath;
  const symlinkPath = path.join(vaultBase, '.obsidian', 'plugins', 'learning-loop');

  // Resolve symlink → active worktree → main .git dir → repo root
  const realPluginPath = fs.realpathSync(symlinkPath);
  const mainGitDir = findMainGitDir(realPluginPath);
  const repoDir = path.dirname(mainGitDir);

  new WorktreeSwitchModal(app, repoDir, symlinkPath).open();
}

module.exports = { switchWorktreeCommand };
