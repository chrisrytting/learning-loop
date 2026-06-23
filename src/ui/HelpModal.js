'use strict';

/**
 * ui/HelpModal.js
 *
 * The Help command UI. A single screen that searches the user's existing
 * problem pages for the current thought and lists the matches. Each page (and
 * each solution within it) has a ＋ button that inserts a reference into the
 * note: ＋ on a page inserts a link to the page; ＋ on a solution inserts a
 * link to that solution's block.
 *
 * On close, the collected references are written into the note as a compact
 * trace, replacing the original thought line(s).
 */

const { Modal, Notice } = require('obsidian');
const { searchProblems } = require('../ai/searchProblems');
const { AiUsageCollector } = require('../ai/usageCollector');
const {
  listProblemNames,
  readProblemPage,
  buildContentIndex,
  ensureSolutionBlockId,
} = require('../vault/problems');
const { buildExecutionWikiLink } = require('../vault/executionLink');
const { writeCommandUsageLog } = require('../vault/logs');
const { writeTrace } = require('../vault/trace');

class HelpModal extends Modal {
  /**
   * @param {import('obsidian').App} app
   * @param {import('obsidian').Editor} editor
   * @param {{ anthropicApiKey: string }} settings
   * @param {{ text: string, fromLine: number, toLine: number, ch0: number, ch1: number }} thought
   */
  constructor(app, editor, settings, thought, plugin = null) {
    super(app);
    this.editor = editor;
    this.settings = settings;
    this.thought = thought;
    this.plugin = plugin;

    this.usageCollector = new AiUsageCollector();
    this.executedAt = new Date();

    // References the user has chosen to insert, keyed by a stable id so the ＋
    // buttons can toggle. Value is the ready-to-write link string.
    this.references = new Map();
    for (const link of thought.relatedProblems || []) {
      this.references.set(referenceKey('problem', link), { kind: 'problem', link });
    }
    const solutionEntries = new Map(
      (thought.relatedSolutionEntries || []).map(entry => [entry.link, entry]),
    );
    for (const link of thought.relatedSolutions || []) {
      const children = solutionEntries.get(link)?.children || [];
      this.references.set(referenceKey('solution', link), { kind: 'solution', link, children });
    }

    this.trajectory = [];
    if (thought.text) this.trajectory.push(`User uttered: "${thought.text}"`);

    // Pages already pulled into the list (by search or manual add).
    this._shownPages = new Set();
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('ll-help-modal');
    this.render();
  }

  render() {
    const { contentEl } = this;
    contentEl.empty();

    const body = contentEl.createDiv({ cls: 'll-scroll-body' });
    if (this.thought.text) {
      body.createEl('blockquote', { text: this.thought.text, cls: 'll-thought' });
    }
    body.createEl('h2', { text: 'What has helped before', cls: 'll-section-heading' });
    body.createEl('p', {
      text: 'Browse your existing problem pages. Click ＋ on a page or a solution to add a reference to your note.',
      cls: 'll-hint',
    });

    this.cardsEl = body.createDiv({ cls: 'll-cards-container' });
    const statusEl = this.cardsEl.createEl('p', { text: 'Searching…', cls: 'll-status' });

    this.renderAddPageRow(body);
    this.renderFooter(body);

    this.runSearch(statusEl);
  }

  async runSearch(statusEl) {
    const allNames = listProblemNames(this.app);
    if (allNames.length === 0) {
      statusEl.setText('No problem pages yet. Log solutions as you find them and they’ll show up here.');
      return;
    }

    let matches = [];
    try {
      const index = await buildContentIndex(this.app);
      this.trajectory.push(`Called \`buildContentIndex\` → ${index.length} entries across ${allNames.length} pages`);
      const result = await searchProblems(this.thought.text, index, [], this.settings, this.usageCollector);
      matches = result.matches;
      this.trajectory.push(
        `\`searchProblems\` returned: ${matches.map(n => `[[${n}]]`).join(', ') || '(none)'}`
        + (result.warning ? `, warning="${result.warning}"` : '')
      );
      if (result.warning) this.cardsEl.createEl('p', { text: result.warning, cls: 'll-warning' });
    } catch (error) {
      this.trajectory.push(`\`searchProblems\` threw: ${error.message}`);
      statusEl.setText(`Search failed: ${error.message}`);
      return;
    }

    statusEl.remove();

    if (matches.length === 0) {
      this.cardsEl.createEl('p', {
        text: 'No matching pages. Use the box below to pull in a page by name.',
        cls: 'll-status',
      });
    }

    for (const name of matches) await this.addPageCard(name);
  }

  // Render one collapsible card for a problem page. Returns silently if the
  // page is missing or already shown.
  async addPageCard(name) {
    if (this._shownPages.has(name)) return;
    const page = await readProblemPage(this.app, name);
    if (!page) return;
    this._shownPages.add(name);

    const card = this.cardsEl.createDiv({ cls: 'll-page-card' });
    const header = card.createDiv({ cls: 'll-page-card-header' });

    const titleBtn = header.createEl('button', { cls: 'll-page-title' });
    const caret = titleBtn.createSpan({ text: '▸', cls: 'll-caret' });
    titleBtn.createSpan({ text: name, cls: 'll-page-name' });

    this.makeAddButton(header, `page:${name}`, 'problem', `[[${name}]]`, `Added page [[${name}]] to note`);

    const solutionsEl = card.createDiv({ cls: 'll-solutions' });
    solutionsEl.style.display = 'none';
    titleBtn.addEventListener('click', () => {
      const open = solutionsEl.style.display !== 'none';
      solutionsEl.style.display = open ? 'none' : 'block';
      caret.setText(open ? '▸' : '▾');
    });

    if (page.solutions.length === 0) {
      solutionsEl.createEl('p', { text: 'No solutions logged yet.', cls: 'll-muted' });
    }
    for (const sol of page.solutions) this.renderSolution(solutionsEl, name, sol);
  }

  renderSolution(container, pageName, sol) {
    const row = container.createDiv({ cls: 'll-solution' });
    const head = row.createDiv({ cls: 'll-solution-head' });
    head.createEl('span', { text: sol.text, cls: 'll-solution-text' });

    // ＋ inserts a block reference, creating a block id on the source line if needed.
    this.makeAddButton(
      head,
      `sol:${pageName}:${sol.text}`,
      'solution',
      async () => {
        const id = await ensureSolutionBlockId(this.app, pageName, sol.text);
        if (!id) { new Notice('Could not link that solution.'); return null; }
        return `[[${pageName}#^${id}|${sol.text}]]`;
      },
      `Added solution reference from [[${pageName}]] to note`,
    );

    const instances = sol.instances.filter(i => i.detail).slice(-2);
    if (instances.length > 0) {
      const list = row.createEl('ul', { cls: 'll-instances' });
      for (const inst of instances) {
        list.createEl('li', { text: `${formatNaturalDate(inst.date)}: "${inst.detail}"`, cls: 'll-instance' });
      }
    } else if (sol.instances.length > 0) {
      row.createEl('span', { text: ` (tried ${sol.instances.length}×)`, cls: 'll-muted' });
    }
  }

  // A toggle ＋/✓ button. `kind` is 'problem' or 'solution'; `link` is either a
  // ready string or an async function that resolves to one (for block refs).
  makeAddButton(parent, key, kind, link, logMsg) {
    const btn = parent.createEl('button', { cls: 'll-add-ref-btn' });
    const sync = () => {
      const added = this.references.has(key);
      btn.setText(added ? '✓' : '＋');
      btn.classList.toggle('is-added', added);
    };
    sync();
    btn.addEventListener('click', async () => {
      if (this.references.has(key)) {
        this.references.delete(key);
        this.trajectory.push(`Removed reference: ${key}`);
      } else {
        const value = typeof link === 'function' ? await link() : link;
        if (!value) return;
        this.references.set(key, { kind, link: value });
        this.trajectory.push(logMsg);
      }
      sync();
      this.updateFooter();
    });
    return btn;
  }

  // Box to pull a page into the list that search didn't surface.
  renderAddPageRow(parent) {
    const allNames = listProblemNames(this.app);
    const row = parent.createDiv({ cls: 'll-add-problem-row' });
    const input = row.createEl('input', { type: 'text', cls: 'll-add-problem-input' });
    input.placeholder = 'Find a problem page…';
    attachSuggestionDatalist(input, () => allNames.filter(n => !this._shownPages.has(n)));

    const addBtn = row.createEl('button', { text: 'Show', cls: 'mod-cta' });
    const doAdd = async () => {
      const name = input.value.trim();
      input.value = '';
      if (!name || !allNames.includes(name) || this._shownPages.has(name)) return;
      this.trajectory.push(`User pulled in page: [[${name}]]`);
      await this.addPageCard(name);
    };
    addBtn.addEventListener('click', doAdd);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') doAdd(); });
  }

  renderFooter(parent) {
    this.footerEl = parent.createDiv({ cls: 'll-button-row' });
    this.updateFooter();
  }

  updateFooter() {
    if (!this.footerEl) return;
    this.footerEl.empty();
    const n = this.references.size;
    const doneBtn = this.footerEl.createEl('button', {
      text: n > 0 ? `Insert ${n} reference${n === 1 ? '' : 's'}` : 'Done',
      cls: 'mod-cta',
    });
    doneBtn.addEventListener('click', () => this.close());
  }

  onClose() {
    this.contentEl.empty();

    const refs = [...this.references.values()];
    const relatedProblems = refs.filter(r => r.kind === 'problem').map(r => r.link);
    const relatedSolutionEntries = refs
      .filter(r => r.kind === 'solution')
      .map(r => ({ link: r.link, children: r.children || [] }));
    const relatedSolutions = relatedSolutionEntries.map(entry => entry.link);
    this.trajectory.push(
      refs.length
        ? `Inserting ${relatedProblems.length} related problem(s) and ${relatedSolutions.length} related solution(s)`
        : 'No references inserted',
    );

    // New thoughts only become traces after a reference is chosen. Existing
    // traces are always rewritten so removing their last reference also sticks.
    if (refs.length > 0 || this.thought.isExistingTrace) {
      writeTrace(this.editor, {
        fromLine: this.thought.fromLine,
        toLine: this.thought.toLine,
        ch0: this.thought.ch0,
        ch1: this.thought.ch1,
        thought: this.thought.text,
        relatedProblems,
        relatedSolutions,
        relatedSolutionEntries,
      });
    }

    const file = this.app.workspace.getActiveFile();
    const executionLink = buildExecutionWikiLink(this.app, file, this.thought.fromLine);
    writeCommandUsageLog(this.app, {
      command: 'help',
      executionLink,
      usages: this.usageCollector.usages,
      trajectoryEntries: this.trajectory,
      timestamp: this.executedAt,
    }).catch(err => console.warn('Learning Loop: failed to write usage log', err));
  }
}

function referenceKey(kind, link) {
  const match = /^\[\[([^\]#|]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]$/.exec(link);
  if (!match) return `existing:${kind}:${link}`;
  if (kind === 'problem') return `page:${match[1]}`;
  return `sol:${match[1]}:${match[2] || link}`;
}

// Attaches an autocomplete datalist to `input`, populated by getSuggestions().
function attachSuggestionDatalist(input, getSuggestions) {
  const datalist = input.parentElement.createEl('datalist');
  datalist.id = `ll-suggestions-${Math.random().toString(36).slice(2)}`;
  input.setAttribute('list', datalist.id);
  datalist.empty();
  for (const name of getSuggestions()) datalist.createEl('option').value = name;
}

// Turns a stored date label like "2026-05-12-Tuesday" into natural language:
// "Tuesday, May 12th, 2026." Falls back to the raw label if it can't be parsed.
function formatNaturalDate(label) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(label ?? ''));
  if (!m) return label;
  const [, y, mo, d] = m;
  const date = new Date(Number(y), Number(mo) - 1, Number(d));
  if (Number.isNaN(date.getTime())) return label;
  const weekday = date.toLocaleDateString('en-US', { weekday: 'long' });
  const month = date.toLocaleDateString('en-US', { month: 'long' });
  const day = Number(d);
  return `${weekday}, ${month} ${day}${ordinalSuffix(day)}, ${y}`;
}

function ordinalSuffix(n) {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return 'th';
  switch (n % 10) {
    case 1: return 'st';
    case 2: return 'nd';
    case 3: return 'rd';
    default: return 'th';
  }
}

module.exports = { HelpModal };
