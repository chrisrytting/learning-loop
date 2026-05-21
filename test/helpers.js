'use strict';

/**
 * Creates a mock Obsidian editor backed by an array of strings.
 * Supports the subset of the editor API used by the Help command.
 */
function createEditor(lines, cursorLine = 0, cursorCh = 0, selection = null) {
  const doc = [...lines];
  let cursor = { line: cursorLine, ch: cursorCh };

  return {
    _doc: doc,
    _getCursor: () => ({ ...cursor }),

    getSelection: () => selection ? selection.text : '',
    getCursor: (which) => {
      if (selection && which === 'from') return { ...selection.from };
      if (selection && which === 'to') return { ...selection.to };
      return { ...cursor };
    },
    getLine: (i) => (i >= 0 && i < doc.length ? doc[i] : ''),
    lineCount: () => doc.length,

    replaceRange(text, from, to) {
      const toPos = to || from;
      const beforeFrom = doc[from.line].slice(0, from.ch);
      const afterTo = doc[toPos.line].slice(toPos.ch);
      const newContent = beforeFrom + text + afterTo;
      const newLines = newContent.split('\n');
      doc.splice(from.line, toPos.line - from.line + 1, ...newLines);
    },

    setCursor(pos) {
      cursor = { line: pos.line, ch: pos.ch };
    },
  };
}

/**
 * Instantiates the plugin and returns the async editorCallback for the Help command.
 * Accepts an optional `files` array for vault/metadata mocking.
 */
async function createPlugin(files = [], settings = {}) {
  const LearningLoopPlugin = require('../main.js');

  const commands = {};
  const adapterFiles = new Map();
  const dirs = new Set(['Problems']);
  for (const file of files) {
    if (file.content !== undefined && file.path) adapterFiles.set(file.path, file.content);
  }

  const app = {
    commands: { executeCommandById: () => {} },
    workspace: {
      getActiveFile: () => ({ basename: 'TestNote', path: 'TestNote.md' }),
    },
    vault: {
      getFiles: () => files.map((f) => ({ extension: 'md', basename: f.basename, path: f.path || f.basename + '.md' })),
      adapter: {
        exists: async (path) => dirs.has(path) || adapterFiles.has(path),
        mkdir: async (path) => { dirs.add(path); },
        read: async (path) => adapterFiles.get(path) || '',
        write: async (path, content) => {
          adapterFiles.set(path, content);
          let entry = files.find((f) => f.path === path);
          if (!entry) {
            const name = path.split('/').pop().replace(/\.md$/, '');
            entry = { basename: name, path, frontmatter: {}, content };
            files.push(entry);
          }
          entry.content = content;
        },
      },
    },
    metadataCache: {
      getFileCache: (file) => {
        const entry = files.find((f) => f.basename === file.basename);
        return entry ? { frontmatter: entry.frontmatter } : null;
      },
    },
    fileManager: {
      processFrontMatter: async (file, fn) => {
        const entry = files.find((f) => f.basename === file.basename);
        if (entry) fn(entry.frontmatter);
      },
    },
  };

  const plugin = new LearningLoopPlugin();
  plugin.app = app;
  plugin.manifest = { dir: '/mock/plugin/dir' };
  plugin.enterInsertMode = () => {};
  plugin.addRibbonIcon = () => {};
  plugin.addSettingTab = () => {};
  plugin.registerEvent = () => {};
  plugin.loadData = async () => settings;
  plugin.saveData = async () => {};
  plugin.syncVaultFiles = async () => {};
  plugin.addCommand = ({ id, editorCallback, callback }) => {
    commands[id] = editorCallback || callback;
  };

  await plugin.onload();

  return {
    help: (editor) => commands.help(editor),
    log: (editor) => commands.log(editor),
    checkKeywords: (editor) => commands['check-keywords'](editor),
    plugin,
    adapterFiles,
  };
}

module.exports = { createEditor, createPlugin };
