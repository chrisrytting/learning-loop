'use strict';

/**
 * commands/smartOpenRight.js
 *
 * Global Cmd+Option+click handler that opens links to the right intelligently:
 *   - Fewer than 2 split panes open → create a new split pane to the right
 *   - 2 split panes already open → open a new tab in the rightmost pane
 *
 * Intercepts at mousedown (capture phase) so it fires before Obsidian's editor
 * handles Cmd+click internally. A flag blocks the subsequent click event to
 * prevent Obsidian from also opening the link.
 */

const { MarkdownView } = require('obsidian');

/**
 * @param {import('obsidian').Plugin} plugin
 */
function registerSmartOpenRight(plugin) {
  let blockNextClick = false;

  plugin.registerDomEvent(document, 'mousedown', (event) => {
    if (!event.metaKey || !event.altKey || event.button !== 0) return;

    const href = resolveHref(plugin.app, event);
    if (!href) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    blockNextClick = true;

    const sourcePath = getSourcePath(plugin.app);
    openSmartRight(plugin.app, href, sourcePath);
  }, { capture: true });

  // Block the click that follows a mousedown we already handled
  plugin.registerDomEvent(document, 'click', (event) => {
    if (!blockNextClick) return;
    blockNextClick = false;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, { capture: true });
}

/**
 * Resolve the link target from whatever was clicked.
 *
 * @param {import('obsidian').App} app
 * @param {MouseEvent} event
 * @returns {string|null}
 */
function resolveHref(app, event) {
  // CM6 Live Preview editor link: span.cm-hmd-internal-link with no data-href
  if (event.target.closest?.('.cm-hmd-internal-link')) {
    return resolveHrefFromCM6(app, event);
  }

  // Backlinks panel file title: div.search-result-file-title > div.tree-item-inner (text content only)
  const fileTitle = event.target.closest?.('.search-result-file-title');
  if (fileTitle) {
    const inner = fileTitle.querySelector('.tree-item-inner');
    if (inner) return inner.textContent.trim();
  }

  // Reading mode internal links, backlinks panel excerpt links, etc.: a[data-href]
  // File explorer sidebar: div.nav-file-title[data-path]
  let el = event.target;
  while (el && el !== document.body) {
    if (el.dataset?.href) return el.dataset.href;
    if (el.dataset?.path) return el.dataset.path;
    el = el.parentElement;
  }
  return null;
}

/**
 * Read the wiki-link under the click position from the CM6 editor state.
 * Handles [[Page Name]] and [[Page Name|Alias]] and [[Page Name#heading]].
 *
 * @param {import('obsidian').App} app
 * @param {MouseEvent} event
 * @returns {string|null}
 */
function resolveHrefFromCM6(app, event) {
  const view = app.workspace.getActiveViewOfType(MarkdownView);
  if (!view) return null;

  const cm = view.editor?.cm;
  if (!cm) return null;

  const pos = cm.posAtCoords({ x: event.clientX, y: event.clientY }, false);
  if (pos === null) return null;

  const line = cm.state.doc.lineAt(pos);
  const col = pos - line.from;
  const text = line.text;

  // Match [[page name]], [[page name#heading]], [[page name|alias]]
  const linkRe = /\[\[([^\]|#]+)(?:[#|][^\]]+)?\]\]/g;
  let match;
  while ((match = linkRe.exec(text)) !== null) {
    if (col >= match.index && col <= match.index + match[0].length) {
      return match[1].trim();
    }
  }
  return null;
}

/**
 * @param {import('obsidian').App} app
 * @returns {string}
 */
function getSourcePath(app) {
  return app.workspace.getActiveFile()?.path ?? '';
}

/**
 * @param {import('obsidian').App} app
 * @param {string} href
 * @param {string} sourcePath
 */
async function openSmartRight(app, href, sourcePath) {
  const file = app.metadataCache.getFirstLinkpathDest(href, sourcePath);
  if (!file) return;

  const rootChildren = app.workspace.rootSplit.children;
  const paneCount = rootChildren.length;

  if (paneCount < 2) {
    // Create a new split pane to the right
    const leaf = app.workspace.getLeaf('split', 'vertical');
    await leaf.openFile(file);
    app.workspace.setActiveLeaf(leaf, { focus: true });
  } else {
    // Open a new tab in the rightmost existing pane
    const rightmostParent = rootChildren[rootChildren.length - 1];
    const existingLeaf = rightmostParent.children?.[rightmostParent.children.length - 1];
    if (existingLeaf) app.workspace.setActiveLeaf(existingLeaf, { focus: false });
    const leaf = app.workspace.getLeaf('tab');
    await leaf.openFile(file);
    app.workspace.setActiveLeaf(leaf, { focus: true });
  }
}

module.exports = { registerSmartOpenRight };
