'use strict';

const { SuggestModal, Notice } = require('obsidian');
const path = require('path');
const fs = require('fs');

function readFileOr(filePath, fallback = '') {
  try { return fs.readFileSync(filePath, 'utf8').trim(); } catch (_) { return fallback; }
}

function getWorktrees(repoDir) {
  const gitDir = path.join(repoDir, '.git');
  const worktrees = [];

  // Main worktree
  const mainHead = readFileOr(path.join(gitDir, 'HEAD'));
  const mainBranch = mainHead.startsWith('ref: refs/heads/')
    ? mainHead.slice('ref: refs/heads/'.length)
    : null;
  worktrees.push({ path: repoDir, branch: mainBranch, head: mainHead.slice(0, 7) });

  // Linked worktrees
  const worktreesDir = path.join(gitDir, 'worktrees');
  let entries = [];
  try { entries = fs.readdirSync(worktreesDir); } catch (_) {}
  for (const name of entries) {
    const wtMeta = path.join(worktreesDir, name);
    // Derive worktree path from the gitdir file (path to <worktree>/.git)
    const gitdirFile = readFileOr(path.join(wtMeta, 'gitdir'));
    if (!gitdirFile) continue;
    const wtPath = path.dirname(path.resolve(wtMeta, gitdirFile));
    const head = readFileOr(path.join(wtMeta, 'HEAD'));
    const branch = head.startsWith('ref: refs/heads/')
      ? head.slice('ref: refs/heads/'.length)
      : null;
    worktrees.push({ path: wtPath, branch, head: head.slice(0, 7) });
  }
  return worktrees;
}

class WorktreeSwitchModal extends SuggestModal {
  constructor(app, repoDir, symlinkPath) {
    super(app);
    this.repoDir = repoDir;
    this.symlinkPath = symlinkPath;
    this.setPlaceholder('Select a worktree to activate…');
  }

  getSuggestions(query) {
    let worktrees;
    try {
      worktrees = getWorktrees(this.repoDir);
    } catch (e) {
      new Notice(`Learning Loop: could not list worktrees — ${e.message}`);
      return [];
    }
    const q = query.toLowerCase();
    return worktrees.filter(wt =>
      (wt.branch || wt.head || wt.path).toLowerCase().includes(q)
    );
  }

  renderSuggestion(wt, el) {
    const label = wt.branch || `detached ${wt.head}`;
    let isActive = false;
    try { isActive = fs.realpathSync(this.symlinkPath) === fs.realpathSync(wt.path); } catch (_) {}
    el.createEl('span', { text: label + (isActive ? ' ✓' : ''), cls: 'suggestion-title' });
    el.createEl('small', { text: wt.path, cls: 'suggestion-note' });
  }

  onChooseSuggestion(wt) {
    try {
      // Remove existing symlink/entry then create new one
      if (fs.existsSync(this.symlinkPath) || fs.lstatSync(this.symlinkPath).isSymbolicLink()) {
        fs.unlinkSync(this.symlinkPath);
      }
      fs.symlinkSync(wt.path, this.symlinkPath);
      const label = wt.branch || `detached ${wt.head}`;
      new Notice(`Learning Loop: switched to "${label}". Reload the plugin to apply.`);
    } catch (e) {
      new Notice(`Learning Loop: failed to switch worktree — ${e.message}`);
    }
  }
}

module.exports = { WorktreeSwitchModal };
