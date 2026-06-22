'use strict';

/**
 * vault/problems.js
 *
 * All read/write operations on the Problems/ directory.
 * Functions here take `app` as a parameter — no plugin state mixed in.
 */

const PROBLEMS_DIR = 'Problems';

// ─── Reading ────────────────────────────────────────────────────────────────

/**
 * Return all problem files as { file: string, solutions: string[] }.
 * Used to give AI context when parsing a log entry.
 *
 * @param {import('obsidian').App} app
 * @returns {Promise<Array<{file: string, solutions: string[]}>>}
 */
async function readProblemFiles(app) {
  const files = app.vault.getFiles()
    .filter(f => f.extension === 'md' && f.path.startsWith(`${PROBLEMS_DIR}/`));
  const entries = [];
  for (const file of files) {
    const content = await app.vault.adapter.read(file.path);
    entries.push(parseProblemFile(file.basename, content));
  }
  return entries;
}

/**
 * Return just the basenames of all problem files.
 *
 * @param {import('obsidian').App} app
 * @returns {string[]}
 */
function listProblemNames(app) {
  return app.vault.getFiles()
    .filter(f => f.extension === 'md' && f.path.startsWith(`${PROBLEMS_DIR}/`))
    .map(f => f.basename);
}

/**
 * Build the query index used by AI search: all Queries frontmatter entries
 * across all problem files.
 *
 * @param {import('obsidian').App} app
 * @returns {Array<{query: string, page: string}>}
 */
function buildQueryIndex(app) {
  const files = app.vault.getFiles()
    .filter(f => f.extension === 'md' && f.path.startsWith(`${PROBLEMS_DIR}/`));
  const entries = [];
  for (const file of files) {
    const cache = app.metadataCache.getFileCache(file);
    const queries = cache?.frontmatter?.['Queries'];
    if (!Array.isArray(queries)) continue;
    for (const q of queries) entries.push({ query: q, page: file.basename });
  }
  return entries;
}

/**
 * Return the "Retrieve Pages" links from all problem files that are mentioned
 * in the given list of names. Used by Help to surface pre-configured retrieval pages.
 *
 * @param {import('obsidian').App} app
 * @param {string[]} mentionedNames - Problem names linked in the trace
 * @returns {Array<{name: string, link: string}>}
 */
function getRetrievePages(app, mentionedNames) {
  const files = app.vault.getFiles()
    .filter(f => f.extension === 'md' && f.path.startsWith(`${PROBLEMS_DIR}/`));
  const nameSet = new Set(mentionedNames);
  const seen = new Set();
  const results = [];

  for (const file of files) {
    if (!nameSet.has(file.basename)) continue;
    const cache = app.metadataCache.getFileCache(file);
    const pages = cache?.frontmatter?.['Retrieve Pages'];
    if (!Array.isArray(pages)) continue;
    for (const entry of pages) {
      const match = entry.match(/\[\[([^\]]+)\]\]/);
      if (!match) continue;
      const raw = match[1];
      const name = raw.includes('|') ? raw.split('|').pop() : raw.split('/').pop();
      if (seen.has(name)) continue;
      seen.add(name);
      results.push({ name, link: raw });
    }
  }

  return results;
}

/**
 * Read and deep-parse a single problem file into structured solution + instance data.
 * Call this after finding a page name by any means (AI search, Retrieve Pages, etc.)
 * to get the display content independently of how the page was found.
 *
 * @param {import('obsidian').App} app
 * @param {string} pageName - basename of the problem file (no .md)
 * @returns {Promise<Array<{
 *   text: string,
 *   instances: Array<{ date: string, detail: string|null }>
 * }> | null>} null if the file doesn't exist
 */
async function readProblemSummary(app, pageName) {
  const file = app.vault.getFiles()
    .find(f => f.extension === 'md' && f.basename === pageName && f.path.startsWith(`${PROBLEMS_DIR}/`));
  if (!file) return null;
  const content = await app.vault.adapter.read(file.path);
  return parseProblemSummary(content);
}

// ─── Writing ─────────────────────────────────────────────────────────────────

/**
 * Write a log entry to a problem file (creating it if needed).
 *
 * @param {import('obsidian').App} app
 * @param {{
 *   problem: string,
 *   solutions: string[],
 *   instanceDetail: string,
 * }} entry
 * @returns {Promise<{path: string, problemName: string, oldContent: string, newContent: string}>}
 */
async function writeProblemLog(app, entry) {
  const { problem, solutions, instanceDetail } = entry;
  const adapter = app.vault.adapter;

  if (!await adapter.exists(PROBLEMS_DIR)) await adapter.mkdir(PROBLEMS_DIR);

  const destination = findDestination(app, problem);
  const exists = await adapter.exists(destination.path);
  const oldContent = exists ? await adapter.read(destination.path) : '';
  const dateLink = formatDateLink();
  const newContent = appendLog(oldContent, destination.problemName, solutions, instanceDetail, dateLink);

  await adapter.write(destination.path, newContent);
  return { path: destination.path, problemName: destination.problemName, oldContent, newContent };
}

/**
 * Append new queries to problem pages' Queries frontmatter.
 * Used by Help after the user reviews retrieved pages.
 *
 * @param {import('obsidian').App} app
 * @param {string} query
 * @param {string[]} pageNames
 */
async function writeQueriesToPages(app, query, pageNames) {
  const files = app.vault.getFiles();
  for (const name of pageNames) {
    const file = files.find(f => f.extension === 'md' && f.basename === name);
    if (!file) continue;
    await app.fileManager.processFrontMatter(file, fm => {
      if (!Array.isArray(fm['Queries'])) fm['Queries'] = [];
      if (!fm['Queries'].includes(query)) fm['Queries'].push(query);
    });
  }
}

/**
 * Remove a query from problem pages' Queries frontmatter.
 * Used by Help when the user unchecks a page in Step 2.
 *
 * @param {import('obsidian').App} app
 * @param {string} query
 * @param {string[]} pageNames
 */
async function removeQueriesFromPages(app, query, pageNames) {
  const files = app.vault.getFiles();
  for (const name of pageNames) {
    const file = files.find(f => f.extension === 'md' && f.basename === name);
    if (!file) continue;
    await app.fileManager.processFrontMatter(file, fm => {
      if (!Array.isArray(fm['Queries'])) return;
      fm['Queries'] = fm['Queries'].filter(q => q !== query);
    });
  }
}

/**
 * Ensure a problem page exists; create it with boilerplate if not.
 *
 * @param {import('obsidian').App} app
 * @param {string} problemName
 * @returns {Promise<{path: string, problemName: string, created: boolean}>}
 */
async function ensureProblemPage(app, problemName) {
  const adapter = app.vault.adapter;
  if (!await adapter.exists(PROBLEMS_DIR)) await adapter.mkdir(PROBLEMS_DIR);

  const files = app.vault.getFiles()
    .filter(f => f.extension === 'md' && f.path.startsWith(`${PROBLEMS_DIR}/`));
  const existing = files.find(f => normalize(f.basename) === normalize(problemName));
  if (existing) return { path: existing.path, problemName: existing.basename, created: false };

  const title = titleCase(problemName);
  const path = `${PROBLEMS_DIR}/${title}.md`;
  await adapter.write(path, buildNewProblemFile(title));
  return { path, problemName: title, created: true };
}

// ─── Internal helpers ────────────────────────────────────────────────────────

function parseProblemFile(basename, content) {
  const solutions = [];
  for (const line of content.split('\n')) {
    const match = line.match(/^\t-\s+(.+?)\s*$/);
    if (match) solutions.push(match[1]);
  }
  return { file: basename.replace(/\.md$/, ''), solutions };
}

/**
 * Deep-parse a problem file into structured solution + instance data.
 * Used by Help to show the user what has worked in the past.
 *
 * Returns:
 *   Array of {
 *     text: string,           — the solution phrase
 *     instances: Array of {
 *       date: string,         — human-readable date label
 *       detail: string|null,  — what the user wrote about that instance
 *     }
 *   }
 *
 * File format assumed:
 *   - Problem Name
 *   \t- Solution text
 *   \t\t- [[date link]]
 *   \t\t\t- instance detail
 */
function parseProblemSummary(content) {
  const lines = content.split('\n');
  const solutions = [];
  let currentSolution = null;
  let currentInstance = null;
  let inFrontmatter = false;

  for (const line of lines) {
    if (line.trim() === '---') { inFrontmatter = !inFrontmatter; continue; }
    if (inFrontmatter) continue;

    // Solution line: exactly one leading tab
    if (/^\t-\s/.test(line) && !/^\t\t/.test(line)) {
      currentSolution = { text: line.replace(/^\t-\s+/, '').trim(), instances: [] };
      solutions.push(currentSolution);
      currentInstance = null;
      continue;
    }

    // Date line: exactly two leading tabs
    if (/^\t\t-\s/.test(line) && !/^\t\t\t/.test(line)) {
      if (!currentSolution) continue;
      const raw = line.replace(/^\t\t-\s+/, '').trim();
      // Extract display label from [[path|label]] or [[label]]
      const wikiMatch = raw.match(/\[\[[^\]]*\|([^\]]+)\]\]/) || raw.match(/\[\[([^\]]+)\]\]/);
      const date = wikiMatch ? wikiMatch[1] : raw;
      currentInstance = { date, detail: null };
      currentSolution.instances.push(currentInstance);
      continue;
    }

    // Instance detail: three or more leading tabs
    if (/^\t\t\t-\s/.test(line) && currentInstance && currentInstance.detail === null) {
      currentInstance.detail = line.replace(/^\t\t\t-\s+/, '').trim();
      continue;
    }
  }

  return solutions;
}

function findDestination(app, problemName) {
  const files = app.vault.getFiles()
    .filter(f => f.extension === 'md' && f.path.startsWith(`${PROBLEMS_DIR}/`));
  const exact = files.find(f => normalize(f.basename) === normalize(problemName));
  if (exact) return { path: exact.path, problemName: exact.basename };
  const title = titleCase(problemName);
  return { path: `${PROBLEMS_DIR}/${title}.md`, problemName: title };
}

function appendLog(content, problemName, solutions, instanceDetail, dateLink) {
  if (!content.trim()) return buildProblemFile(problemName, solutions, instanceDetail, dateLink);

  const lines = content.replace(/\n*$/g, '').split('\n');
  for (const solution of solutions) {
    const solutionLine = `\t- ${solution}`;
    const existingIndex = lines.findIndex(l => l.trim() === solutionLine.trim() && l.startsWith('\t- '));
    const entryLines = [`\t\t- ${dateLink}`];
    if (instanceDetail) entryLines.push(`\t\t\t- ${instanceDetail}`);

    if (existingIndex === -1) {
      lines.push(solutionLine, ...entryLines);
      continue;
    }

    let insertIndex = lines.length;
    for (let i = existingIndex + 1; i < lines.length; i++) {
      if (/^\t-\s+/.test(lines[i])) { insertIndex = i; break; }
    }
    lines.splice(insertIndex, 0, ...entryLines);
  }
  return lines.join('\n') + '\n';
}

function buildProblemFile(problemName, solutions, instanceDetail, dateLink) {
  const lines = [`- ${problemName}`];
  for (const s of solutions) {
    lines.push(`\t- ${s}`);
    lines.push(`\t\t- ${dateLink}`);
    if (instanceDetail) lines.push(`\t\t\t- ${instanceDetail}`);
  }
  return lines.join('\n') + '\n';
}

function buildNewProblemFile(problemName) {
  const tag = problemName.toLowerCase().replace(/\s+/g, '-');
  return ['---', 'tags:', `  - ${tag}`, '---', '', `- ${problemName}`, ''].join('\n');
}

function formatDateLink(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const weekday = date.toLocaleDateString('en-US', { weekday: 'long' });
  const name = `${y}-${m}-${d}-${weekday}`;
  return `[[${y}/${m}/${name}|${name}]]`;
}

// Trailing Obsidian block id on a list item, e.g. "- solution text ^a1b2c3"
const BLOCK_ID_RE = /\s+\^([a-zA-Z0-9-]+)\s*$/;

/**
 * Like parseProblemSummary, but also reports each solution's source line index
 * and Obsidian block id (if any), so callers can build block references.
 *
 * @returns {Array<{ text: string, lineIndex: number, blockId: string|null,
 *   instances: Array<{ date: string, detail: string|null }> }>}
 */
function parseProblemDetailed(content) {
  const lines = content.split('\n');
  const solutions = [];
  let current = null;
  let currentInstance = null;
  let inFrontmatter = false;

  lines.forEach((line, lineIndex) => {
    if (line.trim() === '---') { inFrontmatter = !inFrontmatter; return; }
    if (inFrontmatter) return;

    if (/^\t-\s/.test(line) && !/^\t\t/.test(line)) {
      const raw = line.replace(/^\t-\s+/, '');
      const blockMatch = raw.match(BLOCK_ID_RE);
      const text = raw.replace(BLOCK_ID_RE, '').trim();
      current = { text, lineIndex, blockId: blockMatch ? blockMatch[1] : null, instances: [] };
      solutions.push(current);
      currentInstance = null;
      return;
    }
    if (/^\t\t-\s/.test(line) && !/^\t\t\t/.test(line)) {
      if (!current) return;
      const raw = line.replace(/^\t\t-\s+/, '').trim();
      const wikiMatch = raw.match(/\[\[[^\]]*\|([^\]]+)\]\]/) || raw.match(/\[\[([^\]]+)\]\]/);
      currentInstance = { date: wikiMatch ? wikiMatch[1] : raw, detail: null };
      current.instances.push(currentInstance);
      return;
    }
    if (/^\t\t\t-\s/.test(line) && currentInstance && currentInstance.detail === null) {
      currentInstance.detail = line.replace(/^\t\t\t-\s+/, '').trim();
    }
  });
  return solutions;
}

function findProblemFile(app, pageName) {
  return app.vault.getFiles()
    .find(f => f.extension === 'md' && f.basename === pageName && f.path.startsWith(`${PROBLEMS_DIR}/`));
}

/**
 * Read a problem page and return its solutions with line/block info.
 * @returns {Promise<{ path: string, solutions: ReturnType<typeof parseProblemDetailed> } | null>}
 */
async function readProblemPage(app, pageName) {
  const file = findProblemFile(app, pageName);
  if (!file) return null;
  const content = await app.vault.adapter.read(file.path);
  return { path: file.path, solutions: parseProblemDetailed(content) };
}

/**
 * Build a search index over the *contents* of existing problem pages — each
 * page's name and every solution phrase become a searchable entry. Lets Help
 * rank existing pages by relevance without depending on indexed query history.
 *
 * @returns {Promise<Array<{ query: string, page: string }>>}
 */
async function buildContentIndex(app) {
  const files = app.vault.getFiles()
    .filter(f => f.extension === 'md' && f.path.startsWith(`${PROBLEMS_DIR}/`));
  const entries = [];
  for (const file of files) {
    entries.push({ query: file.basename, page: file.basename });
    const content = await app.vault.adapter.read(file.path);
    for (const sol of parseProblemDetailed(content)) {
      if (sol.text) entries.push({ query: sol.text, page: file.basename });
    }
  }
  return entries;
}

/**
 * Ensure the solution line matching `solutionText` carries an Obsidian block id,
 * writing one into the page if needed (like "Copy link to block"). Returns the
 * block id, or null if the solution couldn't be found.
 */
async function ensureSolutionBlockId(app, pageName, solutionText) {
  const file = findProblemFile(app, pageName);
  if (!file) return null;
  const content = await app.vault.adapter.read(file.path);
  const lines = content.split('\n');
  const target = normalize(solutionText);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!/^\t-\s/.test(line) || /^\t\t/.test(line)) continue;
    const raw = line.replace(/^\t-\s+/, '');
    const blockMatch = raw.match(BLOCK_ID_RE);
    const text = raw.replace(BLOCK_ID_RE, '').trim();
    if (normalize(text) !== target) continue;
    if (blockMatch) return blockMatch[1];
    const id = Math.random().toString(36).slice(2, 8);
    lines[i] = `${line.replace(/\s*$/, '')} ^${id}`;
    await app.vault.adapter.write(file.path, lines.join('\n'));
    return id;
  }
  return null;
}

function normalize(name) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function titleCase(str) {
  return str.trim().replace(/\s+/g, ' ').split(' ').filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

module.exports = {
  PROBLEMS_DIR,
  readProblemFiles,
  readProblemSummary,
  parseProblemSummary,  // exported for tests
  parseProblemDetailed, // exported for tests
  readProblemPage,
  buildContentIndex,
  ensureSolutionBlockId,
  listProblemNames,
  buildQueryIndex,
  getRetrievePages,
  writeProblemLog,
  writeQueriesToPages,
  removeQueriesFromPages,
  ensureProblemPage,
};
