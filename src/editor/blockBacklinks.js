'use strict';

/**
 * Inline, block-specific backlinks.
 *
 * Obsidian's backlink pane groups links by destination file. This module keeps
 * the more precise destination (file + ^block-id), then decorates the source
 * block with a small badge that opens only the references to that block.
 */

const { ViewPlugin, Decoration, WidgetType } = require('@codemirror/view');
const { RangeSetBuilder } = require('@codemirror/state');
const { MarkdownView } = require('obsidian');

const TRAILING_BLOCK_ID_RE = /\s\^([a-zA-Z0-9-]+)\s*$/;

function parseBlockReference(link) {
  const value = String(link ?? '').trim();
  const marker = value.lastIndexOf('#^');
  if (marker <= 0) return null;
  const linkpath = value.slice(0, marker).trim();
  const blockId = value.slice(marker + 2).trim();
  if (!linkpath || !blockId) return null;
  return { linkpath, blockId };
}

function targetKey(path, blockId) {
  return `${path}#^${blockId}`;
}

class BlockBacklinkIndex {
  constructor(app) {
    this.app = app;
    this.byTarget = new Map();
    this.listeners = new Set();
    this.timer = null;
  }

  start(plugin) {
    this.rebuild();
    const schedule = () => this.scheduleRebuild();
    plugin.registerEvent(this.app.metadataCache.on('resolved', schedule));
    plugin.registerEvent(this.app.metadataCache.on('changed', schedule));
    plugin.registerEvent(this.app.vault.on('delete', schedule));
    plugin.registerEvent(this.app.vault.on('rename', schedule));
    plugin.register(() => {
      if (this.timer !== null) window.clearTimeout(this.timer);
      this.listeners.clear();
    });
  }

  scheduleRebuild() {
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => {
      this.timer = null;
      this.rebuild();
      for (const listener of this.listeners) listener();
    }, 150);
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  rebuild() {
    const next = new Map();
    const files = this.app.vault.getMarkdownFiles();

    for (const sourceFile of files) {
      const cache = this.app.metadataCache.getFileCache(sourceFile);
      const candidates = [...(cache?.links ?? []), ...(cache?.embeds ?? [])];
      const seen = new Set();

      for (const candidate of candidates) {
        const parsed = parseBlockReference(candidate.link);
        if (!parsed) continue;
        const targetFile = this.app.metadataCache.getFirstLinkpathDest(
          parsed.linkpath,
          sourceFile.path,
        );
        if (!targetFile) continue;

        const line = candidate.position?.start?.line ?? 0;
        const col = candidate.position?.start?.col ?? 0;
        const occurrenceKey = `${sourceFile.path}:${line}:${col}:${candidate.link}`;
        if (seen.has(occurrenceKey)) continue;
        seen.add(occurrenceKey);

        const key = targetKey(targetFile.path, parsed.blockId);
        const refs = next.get(key) ?? [];
        refs.push({
          sourceFile,
          line,
          col,
          link: candidate.link,
        });
        next.set(key, refs);
      }
    }

    for (const refs of next.values()) {
      refs.sort((a, b) => a.sourceFile.path.localeCompare(b.sourceFile.path) || a.line - b.line);
    }
    this.byTarget = next;
  }

  get(path, blockId) {
    return this.byTarget.get(targetKey(path, blockId)) ?? [];
  }
}

class BlockBacklinksWidget extends WidgetType {
  constructor(app, index, targetPath, blockId, count) {
    super();
    this.app = app;
    this.index = index;
    this.targetPath = targetPath;
    this.blockId = blockId;
    this.count = count;
  }

  eq(other) {
    return other.targetPath === this.targetPath
      && other.blockId === this.blockId
      && other.count === this.count;
  }

  toDOM() {
    const button = document.createElement('button');
    button.className = 'll-block-backlinks-badge';
    button.type = 'button';
    button.textContent = String(this.count);
    const description = `${this.count} ${this.count === 1 ? 'reference' : 'references'}`;
    button.title = `Show ${description}`;
    button.setAttribute('aria-label', `Show ${description} to block ${this.blockId}`);
    button.addEventListener('mousedown', (event) => event.preventDefault());
    button.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      const refs = this.index.get(this.targetPath, this.blockId);
      await showReferencesPopover(this.app, button, refs);
    });
    return button;
  }

  ignoreEvent() {
    return false;
  }
}

function fileForEditor(app, editorView) {
  let file = null;
  app.workspace.iterateAllLeaves((leaf) => {
    if (leaf.view?.editor?.cm === editorView) file = leaf.view.file;
  });
  return file ?? app.workspace.getActiveFile();
}

function buildDecorations(app, index, view) {
  const builder = new RangeSetBuilder();
  const file = fileForEditor(app, view);
  if (!file) return builder.finish();

  for (const { from, to } of view.visibleRanges) {
    let pos = from;
    while (pos <= to) {
      const line = view.state.doc.lineAt(pos);
      const match = line.text.match(TRAILING_BLOCK_ID_RE);
      if (match) {
        const refs = index.get(file.path, match[1]);
        if (refs.length > 0) {
          builder.add(
            line.to,
            line.to,
            Decoration.widget({
              widget: new BlockBacklinksWidget(app, index, file.path, match[1], refs.length),
              side: 2,
            }),
          );
        }
      }
      pos = line.to + 1;
    }
  }
  return builder.finish();
}

function blockBacklinksExtension(app, index) {
  return ViewPlugin.fromClass(
    class {
      constructor(view) {
        this.view = view;
        this.decorations = buildDecorations(app, index, view);
        this.unsubscribe = index.subscribe(() => {
          // A no-op transaction asks CodeMirror to rebuild the count widgets.
          this.view.dispatch({});
        });
      }

      update(update) {
        if (update.docChanged || update.viewportChanged || update.selectionSet || update.transactions.length) {
          this.decorations = buildDecorations(app, index, update.view);
        }
      }

      destroy() {
        this.unsubscribe?.();
      }
    },
    { decorations: (value) => value.decorations },
  );
}

async function snippetsForReferences(app, refs) {
  return Promise.all(refs.map(async (ref) => {
    try {
      const content = await app.vault.cachedRead(ref.sourceFile);
      return { ...ref, snippet: content.split('\n')[ref.line]?.trim() ?? '' };
    } catch (_) {
      return { ...ref, snippet: '' };
    }
  }));
}

function wantsOpenRight(event) {
  return Boolean(event?.metaKey && event?.altKey);
}

function leafForReference(app, openRight) {
  if (!openRight) return app.workspace.getLeaf(false);

  const rootChildren = app.workspace.rootSplit.children;
  if (rootChildren.length < 2) {
    return app.workspace.getLeaf('split', 'vertical');
  }

  const rightmostParent = rootChildren[rootChildren.length - 1];
  const existingLeaf = rightmostParent.children?.[rightmostParent.children.length - 1];
  if (existingLeaf) app.workspace.setActiveLeaf(existingLeaf, { focus: false });
  return app.workspace.getLeaf('tab');
}

async function openReference(app, ref, openRight = false) {
  const leaf = leafForReference(app, openRight);
  await leaf.openFile(ref.sourceFile, { active: true, eState: { line: ref.line } });
  if (openRight) app.workspace.setActiveLeaf(leaf, { focus: true });
  const view = leaf.view;
  if (view instanceof MarkdownView) {
    const cursor = { line: ref.line, ch: ref.col };
    view.editor.setCursor(cursor);
    view.editor.scrollIntoView({ from: cursor, to: cursor }, true);
    view.editor.focus();
  }
}

function removeExistingPopover() {
  document.querySelector('.ll-block-backlinks-popover')?.remove();
}

async function showReferencesPopover(app, anchor, rawRefs) {
  removeExistingPopover();
  const refs = await snippetsForReferences(app, rawRefs);
  const popover = document.createElement('div');
  popover.className = 'll-block-backlinks-popover';
  popover.setAttribute('role', 'dialog');

  const heading = document.createElement('div');
  heading.className = 'll-block-backlinks-heading';
  heading.textContent = `${refs.length} block ${refs.length === 1 ? 'reference' : 'references'}`;
  popover.appendChild(heading);

  for (const ref of refs) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'll-block-backlinks-result';

    const title = document.createElement('span');
    title.className = 'll-block-backlinks-title';
    title.textContent = `${ref.sourceFile.basename} · line ${ref.line + 1}`;
    row.appendChild(title);

    if (ref.snippet) {
      const snippet = document.createElement('span');
      snippet.className = 'll-block-backlinks-snippet';
      snippet.textContent = ref.snippet;
      row.appendChild(snippet);
    }

    row.addEventListener('click', async (event) => {
      popover.remove();
      await openReference(app, ref, wantsOpenRight(event));
    });
    popover.appendChild(row);
  }

  document.body.appendChild(popover);
  const rect = anchor.getBoundingClientRect();
  const width = Math.min(420, window.innerWidth - 24);
  popover.style.width = `${width}px`;
  const left = Math.min(Math.max(12, rect.left), window.innerWidth - width - 12);
  popover.style.left = `${left}px`;
  const measuredHeight = popover.getBoundingClientRect().height;
  const below = rect.bottom + 6;
  const top = below + measuredHeight <= window.innerHeight - 12
    ? below
    : Math.max(12, rect.top - measuredHeight - 6);
  popover.style.top = `${top}px`;

  const remove = () => {
    popover.remove();
    document.removeEventListener('mousedown', closeOnPointer, true);
    document.removeEventListener('keydown', closeOnKey, true);
  };
  const closeOnPointer = (event) => {
    if (!popover.contains(event.target) && !anchor.contains(event.target)) remove();
  };
  const closeOnKey = (event) => {
    // Modifier keys are intentionally ignored so Command+Option-click remains
    // available for opening a reference in the right pane.
    if (event.key === 'Escape') remove();
  };
  window.setTimeout(() => {
    document.addEventListener('mousedown', closeOnPointer, true);
    document.addEventListener('keydown', closeOnKey, true);
  }, 0);
}

function registerReadingViewBadges(plugin, index) {
  plugin.registerMarkdownPostProcessor((el, ctx) => {
    const targetFile = plugin.app.vault.getAbstractFileByPath(ctx.sourcePath);
    if (!targetFile) return;
    const nodes = [];
    if (el.matches?.('[data-block-id]')) nodes.push(el);
    nodes.push(...el.querySelectorAll('[data-block-id]'));

    for (const node of nodes) {
      if (node.querySelector(':scope > .ll-block-backlinks-badge')) continue;
      const blockId = node.dataset.blockId;
      const refs = index.get(targetFile.path, blockId);
      if (refs.length === 0) continue;
      node.appendChild(new BlockBacklinksWidget(
        plugin.app,
        index,
        targetFile.path,
        blockId,
        refs.length,
      ).toDOM());
    }
  });
}

function registerBlockBacklinks(plugin) {
  const index = new BlockBacklinkIndex(plugin.app);
  index.start(plugin);
  plugin.registerEditorExtension(blockBacklinksExtension(plugin.app, index));
  registerReadingViewBadges(plugin, index);
  return index;
}

module.exports = {
  BlockBacklinkIndex,
  parseBlockReference,
  registerBlockBacklinks,
  wantsOpenRight,
};
