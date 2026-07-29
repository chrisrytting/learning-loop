'use strict';

function outputEntries(config) {
  return Object.entries(config.outputPaths);
}

async function findMissingProjectPages(app, config) {
  const missing = [];
  for (const [key, path] of outputEntries(config)) {
    if (!(await app.vault.adapter.exists(path))) missing.push(key);
  }
  return missing;
}

async function readProjectSource(app, config) {
  const adapter = app.vault.adapter;
  if (!(await adapter.exists(config.sourcePath))) {
    throw new Error(`Could not find the project input at ${config.sourcePath}.`);
  }
  return adapter.read(config.sourcePath);
}

async function readProjectPages(app, config) {
  const pages = {};
  for (const [key, path] of outputEntries(config)) {
    if (!(await app.vault.adapter.exists(path))) {
      throw new Error(`The ${key} page is missing at ${path}. Run the command again to create it.`);
    }
    pages[key] = await app.vault.adapter.read(path);
  }
  return pages;
}

async function writeMissingProjectPages(app, config, generated, missingKeys) {
  const created = [];
  for (const key of missingKeys) {
    const path = config.outputPaths[key];
    // Recheck immediately before writing so a concurrent/manual creation is
    // never overwritten.
    if (await app.vault.adapter.exists(path)) continue;
    const content = String(generated[key] || '').trim();
    if (!content) throw new Error(`No content was generated for ${path}.`);
    await ensureParentFolder(app.vault.adapter, path);
    await app.vault.adapter.write(path, `${content}\n`);
    created.push(path);
  }
  return created;
}

async function ensureParentFolder(adapter, path) {
  const parts = path.split('/').slice(0, -1);
  let current = '';
  for (const part of parts) {
    current = current ? `${current}/${part}` : part;
    if (!(await adapter.exists(current))) await adapter.mkdir(current);
  }
}

function normalizeTaskText(task) {
  return String(task || '')
    .trim()
    .replace(/^[-*+]\s+/, '')
    .replace(/^\[[ xX]\]\s+/, '')
    .trim();
}

function insertRoadmapTask(content, proposal) {
  const task = normalizeTaskText(proposal?.task);
  if (!task) return { content, added: false, reason: 'empty-task' };

  const lines = String(content || '').replace(/\r\n/g, '\n').split('\n');
  const comparableTask = task.toLocaleLowerCase();
  const alreadyPresent = lines.some(line => normalizeTaskText(line).toLocaleLowerCase() === comparableTask);
  if (alreadyPresent) return { content, added: false, reason: 'duplicate' };

  const requestedHeading = String(proposal?.heading || 'Proposed additions').trim();
  const headingIndex = lines.findIndex(line => {
    const match = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
    return match && match[2].trim().toLocaleLowerCase() === requestedHeading.toLocaleLowerCase();
  });
  const taskLine = `- [ ] ${task}`;

  if (headingIndex === -1) {
    while (lines.length && !lines.at(-1).trim()) lines.pop();
    if (lines.length) lines.push('');
    lines.push(`## ${requestedHeading}`, '', taskLine, '');
    return { content: lines.join('\n'), added: true, heading: requestedHeading, task };
  }

  const level = /^(#{1,6})\s+/.exec(lines[headingIndex])[1].length;
  let sectionEnd = lines.length;
  for (let i = headingIndex + 1; i < lines.length; i += 1) {
    const next = /^(#{1,6})\s+/.exec(lines[i]);
    if (next && next[1].length <= level) {
      sectionEnd = i;
      break;
    }
  }
  while (sectionEnd > headingIndex + 1 && !lines[sectionEnd - 1].trim()) sectionEnd -= 1;
  lines.splice(sectionEnd, 0, taskLine);
  return { content: lines.join('\n'), added: true, heading: requestedHeading, task };
}

async function addRoadmapProposal(app, config, proposal) {
  const path = config.outputPaths.roadmap;
  const adapter = app.vault.adapter;
  if (!(await adapter.exists(path))) throw new Error(`Roadmap page is missing at ${path}.`);
  const original = await adapter.read(path);
  const result = insertRoadmapTask(original, proposal);
  if (result.added) await adapter.write(path, result.content.endsWith('\n') ? result.content : `${result.content}\n`);
  return { ...result, path };
}

module.exports = {
  findMissingProjectPages,
  readProjectSource,
  readProjectPages,
  writeMissingProjectPages,
  normalizeTaskText,
  insertRoadmapTask,
  addRoadmapProposal,
};
