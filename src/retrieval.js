'use strict';

const { requestUrl } = require('obsidian');

function extractLinks(editor, startLine, endLine) {
  const links = [];
  const linkRegex = /\[\[([^\]]+)\]\]/g;
  for (let i = startLine + 1; i <= endLine; i++) {
    const line = editor.getLine(i);
    let match;
    while ((match = linkRegex.exec(line)) !== null) {
      const raw = match[1];
      const name = raw.includes('|') ? raw.split('|').pop() : raw.split('/').pop();
      links.push(name);
    }
  }
  return links;
}

function fileToLink(file) {
  return file.path.replace(/\.md$/, '') + '|' + file.basename;
}

async function retrieveLinkedPages(mentionedLinks) {
  const allFiles = this.app.vault.getFiles();
  const problemFiles = allFiles.filter(f => f.extension === 'md' && f.path.startsWith('Problems/'));
  const problemNameSet = new Set(problemFiles.map(f => f.basename));

  const seen = new Set();
  const results = [];
  for (const name of mentionedLinks) {
    if (!problemNameSet.has(name)) continue;
    const file = problemFiles.find(f => f.basename === name);
    if (!file) continue;
    const cache = this.app.metadataCache.getFileCache(file);
    const retrievePages = cache?.frontmatter?.['Retrieve Pages'];
    if (!Array.isArray(retrievePages)) continue;
    for (const entry of retrievePages) {
      const match = entry.match(/\[\[([^\]]+)\]\]/);
      if (!match) continue;
      const raw = match[1];
      const entryName = raw.includes('|') ? raw.split('|').pop() : raw.split('/').pop();
      if (seen.has(entryName)) continue;
      seen.add(entryName);
      results.push({ name: entryName, link: raw });
    }
  }

  return results;
}

async function insertSearchResults(editor, mentionedLinks, cueText, blockEnd) {
  const retrieveMatches = await this.retrieveLinkedPages(mentionedLinks);
  const excludeNames = retrieveMatches.map(m => m.name);
  const { aiMatches, aiWarning } = await this.runAiSearch(cueText, excludeNames);

  let outputLines = '';
  for (const m of retrieveMatches) outputLines += '\n\t\t- [[' + m.link + ']]';
  for (const m of aiMatches) outputLines += '\n\t\t- [[' + m.link + ']] (ai)';
  if (aiWarning) outputLines += '\n\t\t- ' + aiWarning;

  const insertion = '\n\t- Learning Loop Output' + outputLines +
    '\n\t- Review\n\t\t- ';

  const lineLen = editor.getLine(blockEnd).length;
  editor.replaceRange(insertion, { line: blockEnd, ch: lineLen });

  const totalOutputLines = retrieveMatches.length + aiMatches.length + (aiWarning ? 1 : 0);
  const reviewLabelLine = blockEnd + 1 + totalOutputLines + 1;
  const cursorLine = reviewLabelLine + 1;
  editor.setCursor({ line: cursorLine, ch: '\t\t- '.length });
  this.enterInsertMode(editor);
}

function buildQueryIndex() {
  const allFiles = this.app.vault.getFiles();
  const problemFiles = allFiles.filter(f => f.extension === 'md' && f.path.startsWith('Problems/'));
  const entries = [];
  for (const file of problemFiles) {
    const cache = this.app.metadataCache.getFileCache(file);
    const queries = cache?.frontmatter?.['Queries'];
    if (!Array.isArray(queries)) continue;
    for (const q of queries) {
      entries.push({ query: q, page: file.basename });
    }
  }
  return entries;
}

async function runAiSearch(cueText, excludeNames) {
  let aiMatches = [];
  let aiWarning = null;

  const queryIndex = this.buildQueryIndex();
  if (queryIndex.length === 0) return { aiMatches, aiWarning };

  const allFiles = this.app.vault.getFiles();
  const problemFiles = allFiles.filter(f => f.extension === 'md' && f.path.startsWith('Problems/'));
  const nameToLink = new Map();
  for (const f of problemFiles) nameToLink.set(f.basename, this.fileToLink(f));

  if (!this.settings.anthropicApiKey) {
    aiWarning = '⚠ no API key set — Retrieve Pages search only (add key in plugin settings)';
  } else {
    try {
      const indexText = queryIndex.map(e => `- "${e.query}" → ${e.page}`).join('\n');
      const prompt = `Given this cue: "${cueText}"\n\nHere is an index of past queries mapped to their problem pages:\n${indexText}\n\nReturn a JSON array of page names whose queries are semantically similar to the cue. Only return page names from the index. Deduplicate page names. Return ONLY a raw JSON array with no markdown, no code fences, no explanation. Example: ["Stress", "Anxiety"]`;

      const response = await requestUrl({
        url: 'https://api.anthropic.com/v1/messages',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.settings.anthropicApiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 256,
          messages: [{ role: 'user', content: prompt }],
        }),
      });

      if (response.status < 200 || response.status >= 300) {
        throw new Error(`API error ${response.status}: ${response.text}`);
      }

      const data = response.json;
      const raw = (data.content?.[0]?.text ?? '[]').replace(/^```[a-z]*\n?/i, '').replace(/```$/, '').trim();
      const parsed = JSON.parse(raw);
      const validNames = new Set(queryIndex.map(e => e.page));
      const excludeSet = new Set(excludeNames);
      aiMatches = parsed
        .filter(name => validNames.has(name) && !excludeSet.has(name))
        .map(name => ({ name, link: nameToLink.get(name) || name }));
    } catch (e) {
      aiWarning = `⚠ AI search failed — Retrieve Pages search only (${e.message})`;
    }
  }

  return { aiMatches, aiWarning };
}

async function writeQueriesToPages(query, pageNames) {
  const allFiles = this.app.vault.getFiles();
  for (const name of pageNames) {
    const file = allFiles.find(f => f.extension === 'md' && f.basename === name);
    if (!file) continue;
    await this.app.fileManager.processFrontMatter(file, (fm) => {
      if (!Array.isArray(fm['Queries'])) fm['Queries'] = [];
      if (!fm['Queries'].includes(query)) fm['Queries'].push(query);
    });
  }
}

module.exports = {
  extractLinks,
  fileToLink,
  retrieveLinkedPages,
  insertSearchResults,
  buildQueryIndex,
  runAiSearch,
  writeQueriesToPages,
};
