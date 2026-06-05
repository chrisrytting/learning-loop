'use strict';

/**
 * vault/values.js
 *
 * Read and parse Values.md under the configured base-path folder.
 */

const VALUES_FILENAME = 'Values.md';

/**
 * @param {string} basePathFolder - Vault-relative folder (may be empty for vault root)
 * @returns {string}
 */
function valuesFilePath(basePathFolder) {
  const base = normalizeBasePath(basePathFolder);
  return base ? `${base}/${VALUES_FILENAME}` : VALUES_FILENAME;
}

/**
 * @param {string} path
 * @returns {string}
 */
function normalizeBasePath(path) {
  return String(path || '').trim().replace(/^\/+/, '').replace(/\/+$/, '');
}

/**
 * Parse a Values note into discrete value entries.
 * Supports bullets, numbered lists, and markdown headings with optional body text.
 *
 * @param {string} content
 * @returns {Array<{ name: string, detail: string }>}
 */
function parseValuesPage(content) {
  const lines = String(content || '').split('\n');
  const values = [];
  let inFrontmatter = false;
  let frontmatterDone = false;
  let currentHeading = null;
  let currentBody = [];

  const flushHeading = () => {
    if (!currentHeading) return;
    values.push({
      name: currentHeading,
      detail: currentBody.join(' ').trim(),
    });
    currentHeading = null;
    currentBody = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();

    if (!frontmatterDone && trimmed === '---') {
      inFrontmatter = !inFrontmatter;
      if (!inFrontmatter) frontmatterDone = true;
      continue;
    }
    if (inFrontmatter) continue;

    const heading = line.match(/^#{1,3}\s+(.+)$/);
    if (heading) {
      flushHeading();
      currentHeading = heading[1].trim();
      continue;
    }

    const bullet = line.match(/^\s*[-*+]\s+(.+)$/);
    if (bullet) {
      flushHeading();
      values.push({ name: bullet[1].trim(), detail: '' });
      continue;
    }

    const numbered = line.match(/^\s*\d+[.)]\s+(.+)$/);
    if (numbered) {
      flushHeading();
      values.push({ name: numbered[1].trim(), detail: '' });
      continue;
    }

    if (currentHeading && trimmed) {
      currentBody.push(trimmed);
    }
  }

  flushHeading();
  return values.filter(v => v.name);
}

/**
 * @param {import('obsidian').App} app
 * @param {string} basePathFolder
 * @returns {Promise<{
 *   status: 'ok' | 'missing',
 *   path: string,
 *   values: Array<{ name: string, detail: string }>,
 *   content: string,
 * }>}
 */
async function loadValuesPage(app, basePathFolder) {
  const path = valuesFilePath(basePathFolder);
  const adapter = app.vault.adapter;
  const exists = await adapter.exists(path);
  if (!exists) {
    return { status: 'missing', path, values: [], content: '' };
  }

  const content = await adapter.read(path);
  return {
    status: 'ok',
    path,
    values: parseValuesPage(content),
    content,
  };
}

/**
 * @param {import('obsidian').App} app
 * @param {string} basePathFolder
 * @returns {Promise<string>} path written
 */
async function ensureValuesFile(app, basePathFolder) {
  const path = valuesFilePath(basePathFolder);
  const adapter = app.vault.adapter;
  const base = normalizeBasePath(basePathFolder);

  if (base && !(await adapter.exists(base))) {
    await adapter.mkdir(base);
  }

  if (!(await adapter.exists(path))) {
    await adapter.write(path, buildValuesTemplate());
  }

  return path;
}

function buildValuesTemplate() {
  return [
    '# Values',
    '',
    'List the values you want to compare actions against (one per line):',
    '',
    '- ',
    '- ',
    '',
  ].join('\n');
}

/**
 * @param {import('obsidian').App} app
 * @param {string} path
 */
async function openValuesFile(app, path) {
  await ensureParentLoaded(app, path);
  const file = app.vault.getAbstractFileByPath(path);
  if (file && 'extension' in file) {
    await app.workspace.getLeaf(false).openFile(file);
    return;
  }
  await app.workspace.openLinkText(path, '', true);
}

async function ensureParentLoaded(app, path) {
  const folder = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
  if (folder && !(await app.vault.adapter.exists(folder))) {
    await app.vault.adapter.mkdir(folder);
  }
}

module.exports = {
  VALUES_FILENAME,
  valuesFilePath,
  normalizeBasePath,
  parseValuesPage,
  loadValuesPage,
  ensureValuesFile,
  openValuesFile,
  buildValuesTemplate,
};
