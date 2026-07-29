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
const { parseBrainstormSolution } = require('../ai/brainstormSolution');
const { AiUsageCollector } = require('../ai/usageCollector');
const {
  listProblemNames,
  readProblemPage,
  buildContentIndex,
  ensureSolutionBlockId,
  writeProblemLog,
} = require('../vault/problems');
const { readBrainstormQuestions, sampleQuestion } = require('../vault/brainstormQuestions');
const { buildExecutionWikiLink } = require('../vault/executionLink');
const { writeCommandUsageLog } = require('../vault/logs');
const { writeTrace } = require('../vault/trace');
const { registerModalShortcuts } = require('./modalShortcuts');
const { registerHelpShortcuts } = require('./helpShortcuts');

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

    this.usageCollector = new AiUsageCollector({
      captureTranscripts: settings?.logAiTranscripts,
    });
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
    this._shownPageOrder = [];
    this._surfacedSolutionCount = 0;
    this._brainstormQuestions = [];
    this._brainstormQuestion = '';
    this._brainstormAnswerDraft = '';
    this._brainstormTargetPage = '';
    this._brainstormOpen = false;
    this._brainstormLoading = false;
    this._focusBrainstormAnswerOnRender = false;
    this._focusCandidateIdOnRender = null;
    this._candidateSeq = 1;
    this.brainstormCandidates = [];
    // Closing by Escape, the close icon, or other ambient means is a cancel.
    // Only finish() opts into writing the selected references.
    this.cancelled = true;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('ll-help-modal');
    contentEl.setAttr('tabindex', '-1');
    registerModalShortcuts(this.scope, {
      primary: event => this.handlePrimaryShortcut(event),
      cancel: () => this.cancel(),
    }, { enterInSingleLineInput: false });
    registerHelpShortcuts(this.scope, {
      brainstorm: () => this.startBrainstorm(),
      anotherQuestion: () => this.tryAnotherBrainstormQuestion(),
    });
    this.render();
    window.requestAnimationFrame(() => contentEl.focus());
  }

  handlePrimaryShortcut(event) {
    if (event?.target?.classList?.contains('ll-brainstorm-answer')) {
      this.submitCurrentBrainstormAnswer();
      return;
    }
    this.finish();
  }

  async finish() {
    await this.persistSelectedBrainstormCandidates();
    this.cancelled = false;
    this.close();
  }

  cancel() {
    this.cancelled = true;
    this.close();
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

    this.brainstormEl = body.createDiv({ cls: 'll-brainstorm-panel' });
    this.renderAddPageRow(body);
    this.renderFooter(body);

    this.runSearch(statusEl);
  }

  async runSearch(statusEl) {
    const allNames = listProblemNames(this.app);
    if (allNames.length === 0) {
      statusEl.setText('No problem pages yet. Log solutions as you find them and they’ll show up here.');
      this.updateBrainstormPanel();
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
    this.updateBrainstormPanel();
  }

  // Render one collapsible card for a problem page. Returns silently if the
  // page is missing or already shown.
  async addPageCard(name) {
    if (this._shownPages.has(name)) return null;
    const page = await readProblemPage(this.app, name);
    if (!page) return null;
    this._shownPages.add(name);
    this._shownPageOrder.push(name);
    this._surfacedSolutionCount += page.solutions.length;

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
    return page;
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
      this.updateBrainstormPanel();
    };
    addBtn.addEventListener('click', doAdd);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') doAdd(); });
  }

  updateBrainstormPanel() {
    if (!this.brainstormEl) return;
    this.brainstormEl.empty();
    const targetPage = this.getBrainstormTargetPage();

    if (!this._brainstormOpen && this.brainstormCandidates.length === 0) {
      const btn = this.brainstormEl.createEl('button', {
        text: 'Help me brainstorm solutions (B)',
        cls: 'mod-cta',
      });
      btn.addEventListener('click', () => this.startBrainstorm());
      return;
    }

    this.renderBrainstormForm(targetPage);
  }

  async startBrainstorm() {
    this._brainstormOpen = true;
    this._brainstormTargetPage = this.getBrainstormTargetPage();
    if (!this._brainstormQuestion) await this.chooseBrainstormQuestion();
    this._focusBrainstormAnswerOnRender = true;
    this.updateBrainstormPanel();
  }

  async tryAnotherBrainstormQuestion() {
    if (!this._brainstormOpen || this._brainstormLoading) return;
    await this.chooseBrainstormQuestion();
    this._focusBrainstormAnswerOnRender = true;
    this.updateBrainstormPanel();
  }

  async chooseBrainstormQuestion() {
    try {
      if (this._brainstormQuestions.length === 0) {
        this._brainstormQuestions = await readBrainstormQuestions(this.app);
      }
      this._brainstormQuestion = sampleQuestion(this._brainstormQuestions, this._brainstormQuestion);
      this.trajectory.push('Started brainstorm interview for missing Help solutions');
    } catch (error) {
      this._brainstormQuestion = '';
      this.trajectory.push(`Brainstorm question setup failed: ${error.message}`);
      new Notice(`Could not load brainstorming questions: ${error.message}`);
    }
  }

  renderBrainstormForm(targetPage) {
    this.brainstormEl.createEl('h3', { text: 'Brainstorm a solution', cls: 'll-brainstorm-heading' });
    this.brainstormEl.createEl('p', {
      text: targetPage
        ? `New ideas will default to [[${targetPage}]], and you can change the target below.`
        : 'New ideas can be assigned to a problem page after they become candidate solutions.',
      cls: 'll-hint',
    });

    if (this._brainstormQuestion) {
      this.brainstormEl.createEl('p', { text: this._brainstormQuestion, cls: 'll-brainstorm-question' });
    }

    const answer = this.brainstormEl.createEl('textarea', { cls: 'll-brainstorm-answer' });
    answer.rows = 4;
    answer.placeholder = 'Type what comes to mind...';
    answer.value = this._brainstormAnswerDraft;
    this.brainstormAnswerEl = answer;
    answer.addEventListener('input', () => { this._brainstormAnswerDraft = answer.value; });
    if (this._focusBrainstormAnswerOnRender) {
      this._focusBrainstormAnswerOnRender = false;
      window.requestAnimationFrame(() => answer.focus());
    }

    const row = this.brainstormEl.createDiv({ cls: 'll-brainstorm-actions' });
    const submitBtn = row.createEl('button', {
      text: this._brainstormLoading ? 'Parsing...' : 'Submit (Mod+Enter)',
      cls: 'mod-cta',
    });
    submitBtn.disabled = this._brainstormLoading;
    submitBtn.addEventListener('click', () => this.submitCurrentBrainstormAnswer());

    const anotherBtn = row.createEl('button', { text: 'Try another question (Q)' });
    anotherBtn.disabled = this._brainstormLoading;
    anotherBtn.addEventListener('click', () => this.tryAnotherBrainstormQuestion());

    this.renderBrainstormCandidates();
  }

  addManualCandidate() {
    const candidate = {
      id: this._candidateSeq++,
      pageName: this.getBrainstormTargetPage() || '',
      solution: '',
      selected: true,
      saved: false,
    };
    this.brainstormCandidates.push(candidate);
    this._focusCandidateIdOnRender = candidate.id;
    this.trajectory.push(
      candidate.pageName
        ? `Added blank brainstorm candidate for [[${candidate.pageName}]]`
        : 'Added blank brainstorm candidate with no target page yet',
    );
    this.updateBrainstormPanel();
  }

  removeBrainstormCandidate(candidateId) {
    const candidate = this.brainstormCandidates.find(item => item.id === candidateId);
    this.brainstormCandidates = this.brainstormCandidates.filter(item => item.id !== candidateId);
    if (candidate) {
      this.trajectory.push(
        candidate.solution
          ? `Deleted brainstorm candidate: ${candidate.solution}`
          : 'Deleted blank brainstorm candidate',
      );
    }
    this.updateBrainstormPanel();
  }

  async submitCurrentBrainstormAnswer() {
    if (!this._brainstormOpen || this._brainstormLoading) return;
    if (this.brainstormAnswerEl) this._brainstormAnswerDraft = this.brainstormAnswerEl.value;
    await this.submitBrainstormAnswer(this.getBrainstormTargetPage(), this._brainstormAnswerDraft);
  }

  async submitBrainstormAnswer(targetPage, answer) {
    const text = String(answer || '').trim();
    if (!text) return;
    this._brainstormLoading = true;
    this.updateBrainstormPanel();
    try {
      const solution = await parseBrainstormSolution(
        this.thought.text,
        this._brainstormQuestion,
        text,
        this.settings,
        this.usageCollector,
      );
      if (!solution) {
        new Notice('I could not find a clear solution in that response.');
        this.trajectory.push('Brainstorm answer produced no candidate solution');
        return;
      }
      const candidate = {
        id: this._candidateSeq++,
        pageName: targetPage || '',
        solution,
        selected: true,
        saved: false,
      };
      this.brainstormCandidates.push(candidate);
      this._brainstormAnswerDraft = '';
      this._focusBrainstormAnswerOnRender = true;
      this.trajectory.push(
        targetPage
          ? `Brainstorm candidate for [[${targetPage}]]: ${solution}`
          : `Brainstorm candidate with no target page yet: ${solution}`,
      );
    } catch (error) {
      new Notice(`Could not parse brainstorm answer: ${error.message}`);
      this.trajectory.push(`Brainstorm answer parsing failed: ${error.message}`);
    } finally {
      this._brainstormLoading = false;
      this.updateBrainstormPanel();
    }
  }

  renderBrainstormCandidates() {
    const allNames = listProblemNames(this.app);
    this.brainstormEl.createEl('h4', {
      text: 'New candidate solutions',
      cls: 'll-brainstorm-candidates-heading',
    });
    const list = this.brainstormEl.createDiv({ cls: 'll-brainstorm-candidates' });
    const header = list.createDiv({ cls: 'll-brainstorm-candidate ll-brainstorm-candidate-header' });
    header.createEl('span', { text: '' });
    header.createEl('span', { text: 'solution' });
    header.createEl('span', { text: 'adding to' });
    header.createEl('span', { text: '' });

    for (const candidate of this.brainstormCandidates) {
      const row = list.createDiv({ cls: 'll-brainstorm-candidate' });
      const checkbox = row.createEl('input', { type: 'checkbox' });
      checkbox.checked = candidate.selected;
      checkbox.addEventListener('change', () => { candidate.selected = checkbox.checked; });

      const solutionInput = row.createEl('textarea', {
        cls: 'll-brainstorm-solution-input',
      });
      solutionInput.rows = 2;
      solutionInput.value = candidate.solution;
      solutionInput.addEventListener('input', () => { candidate.solution = solutionInput.value.trim(); });
      if (this._focusCandidateIdOnRender === candidate.id) {
        this._focusCandidateIdOnRender = null;
        window.requestAnimationFrame(() => solutionInput.focus());
      }

      const targetInput = row.createEl('input', {
        type: 'text',
        cls: 'll-brainstorm-target-input',
      });
      targetInput.value = candidate.pageName;
      attachSuggestionDatalist(targetInput, () => allNames);
      targetInput.addEventListener('input', () => { candidate.pageName = targetInput.value.trim(); });
      targetInput.addEventListener('change', () => { candidate.pageName = targetInput.value.trim(); });

      const removeBtn = row.createEl('button', {
        text: '🗑',
        cls: 'll-brainstorm-delete-candidate-btn',
      });
      removeBtn.setAttribute('aria-label', 'Delete candidate solution');
      removeBtn.setAttribute('title', 'Delete candidate solution');
      removeBtn.addEventListener('click', () => this.removeBrainstormCandidate(candidate.id));
    }

    const addRow = this.brainstormEl.createDiv({ cls: 'll-brainstorm-add-row' });
    const addBtn = addRow.createEl('button', {
      text: '＋',
      cls: 'll-brainstorm-add-candidate-btn',
    });
    addBtn.setAttribute('aria-label', 'Add candidate solution');
    addBtn.setAttribute('title', 'Add candidate solution');
    addBtn.addEventListener('click', () => this.addManualCandidate());
  }

  getBrainstormTargetPage() {
    return this._brainstormTargetPage || this._shownPageOrder[0] || null;
  }

  async persistSelectedBrainstormCandidates() {
    for (const candidate of this.brainstormCandidates) {
      const solution = String(candidate.solution || '').trim();
      if (!candidate.selected || candidate.saved || !candidate.pageName || !solution) continue;
      const allNames = listProblemNames(this.app);
      if (!allNames.includes(candidate.pageName)) {
        new Notice(`Choose an existing problem page for: ${solution}`);
        this.trajectory.push(`Skipped brainstorm solution with unknown target page: ${candidate.pageName}`);
        continue;
      }
      try {
        await writeProblemLog(this.app, { problem: candidate.pageName, solutions: [solution] });
        const id = await ensureSolutionBlockId(this.app, candidate.pageName, solution);
        if (!id) {
          this.trajectory.push(`Saved brainstorm solution to [[${candidate.pageName}]] but could not create block link`);
          candidate.saved = true;
          continue;
        }
        const link = `[[${candidate.pageName}#^${id}|${solution}]]`;
        this.references.set(referenceKey('solution', link), { kind: 'solution', link });
        candidate.saved = true;
        this.trajectory.push(`Saved brainstorm solution to [[${candidate.pageName}]] and selected it`);
      } catch (error) {
        new Notice(`Could not save brainstorm solution: ${error.message}`);
        this.trajectory.push(`Brainstorm solution save failed: ${error.message}`);
      }
    }
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
      text: n > 0
        ? `Insert ${n} reference${n === 1 ? '' : 's'} (Enter)`
        : 'Done (Enter)',
      cls: 'mod-cta',
    });
    doneBtn.addEventListener('click', () => this.finish());

    const cancelBtn = this.footerEl.createEl('button', { text: 'Cancel (Esc)' });
    cancelBtn.addEventListener('click', () => this.cancel());
  }

  onClose() {
    this.contentEl.empty();

    const refs = this.cancelled ? [] : [...this.references.values()];
    const relatedProblems = refs.filter(r => r.kind === 'problem').map(r => r.link);
    const relatedSolutionEntries = refs
      .filter(r => r.kind === 'solution')
      .map(r => ({ link: r.link, children: r.children || [] }));
    const relatedSolutions = relatedSolutionEntries.map(entry => entry.link);
    this.trajectory.push(
      this.cancelled
        ? 'Cancelled without inserting references'
        : refs.length
        ? `Inserting ${relatedProblems.length} related problem(s) and ${relatedSolutions.length} related solution(s)`
        : 'No references inserted',
    );

    // New thoughts only become traces after a reference is chosen. Existing
    // traces are always rewritten so removing their last reference also sticks.
    if (!this.cancelled && (refs.length > 0 || this.thought.isExistingTrace)) {
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
