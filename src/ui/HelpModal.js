'use strict';

/**
 * ui/HelpModal.js
 *
 * The primary UI for the Help command. Replaces the old inline trace state machine.
 *
 * Flow:
 *   Step 1 — Problem identification
 *     - Shows the user's thought (pre-filled from editor)
 *     - Calls identifyProblem() and shows the result
 *     - Buttons: [Accept] [Edit] [Skip]
 *
 *   Step 2 — Page retrieval (shown after Step 1 resolves)
 *     - Shows pages from "Retrieve Pages" frontmatter + AI search results
 *     - User can select which to keep, or dismiss
 *     - Button: [Done]
 *
 *   On close:
 *     - Calls writeTrace() to append a compact record to the note
 *     - Calls writeQueriesToPages() to index the cue text on selected pages
 */

const { Modal, Setting, Notice } = require('obsidian');
const { identifyProblem } = require('../ai/identifyProblem');
const { searchProblems } = require('../ai/searchProblems');
const { AiUsageCollector } = require('../ai/usageCollector');
const { listProblemNames, buildQueryIndex, getRetrievePages, readProblemSummary, ensureProblemPage, writeQueriesToPages, removeQueriesFromPages } = require('../vault/problems');
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
    this.executedAt = new Date();
    this.usageCollector = new AiUsageCollector();

    // Navigation state
    this.step = 1;
    this.step2Visited = false;

    // State built up through the steps
    this.problemName = null;       // resolved after Step 1
    this.selectedPages = [];       // resolved after Step 2

    // Cached AI results — avoid re-calling on back/forward navigation
    this._step1Result = null;      // result of identifyProblem
    this._step2Data = null;        // { summaries, allPageNames, warning, forProblem }


    // Trajectory: chronological log of what happened during this run
    this.trajectory = [];
    if (thought.text) {
      this.trajectory.push(`User uttered: "${thought.text}"`);
    } else {
      this.trajectory.push('User uttered: (empty — no text on cursor line)');
    }
  }

  _cacheGet(key) {
    if (!this.plugin?.settings?.enableAiCache) return undefined;
    return this.plugin.settings.aiCache?.[key];
  }

  _cacheSet(key, value) {
    if (!this.plugin?.settings?.enableAiCache) return;
    if (!this.plugin.settings.aiCache) this.plugin.settings.aiCache = {};
    this.plugin.settings.aiCache[key] = value;
    this.plugin.saveSettings().catch(() => {});
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('ll-help-modal');
    this.renderStep1();
  }

  // ─── Step 1: Problem identification ───────────────────────────────────────

  renderNavBar() {
    const nav = this.contentEl.createDiv({ cls: 'll-nav-bar' });

    const backBtn = nav.createEl('button', { text: '←', cls: 'll-nav-btn' });
    backBtn.disabled = this.step <= 1;
    backBtn.addEventListener('click', () => {
      this.trajectory.push('User navigated back to Step 1');
      this.step = 1;
      this.renderStep1();
    });

    const fwdBtn = nav.createEl('button', { text: '→', cls: 'll-nav-btn' });
    fwdBtn.disabled = this.step >= 2 || !this.step2Visited;
    fwdBtn.addEventListener('click', () => {
      this.trajectory.push('User navigated forward to Step 2');
      this.step = 2;
      this.renderStep2();
    });
  }

  renderStep1() {
    const { contentEl } = this;
    contentEl.empty();
    this.step = 1;
    this.renderNavBar();

    if (this.thought.text) {
      contentEl.createEl('p', { text: 'You said', cls: 'll-thought-label' });
      contentEl.createEl('blockquote', { text: this.thought.text, cls: 'll-thought' });
    }
    contentEl.createEl('h2', { text: 'Related problems' });

    const statusEl = contentEl.createEl('p', { text: 'Identifying problem…', cls: 'll-status' });
    const buttonRow = contentEl.createDiv({ cls: 'll-button-row' });

    // Run identification in background; render buttons when done
    this.runIdentification(statusEl, buttonRow);
  }

  async runIdentification(statusEl, buttonRow) {
    if (this._step1Result) {
      this.renderStep1Result(this._step1Result, statusEl, buttonRow);
      return;
    }

    const existingNames = listProblemNames(this.app);
    const identifyCacheKey = `id:${this.thought.text}|${[...existingNames].sort().join(',')}`;
    this.trajectory.push(`Called \`identifyProblem\` with ${existingNames.length} existing problems: ${existingNames.map(n => `[[${n}]]`).join(', ')}`);

    try {
      const cached = this._cacheGet(identifyCacheKey);
      const result = cached
        ? (this.trajectory.push('`identifyProblem` result served from cache'), cached)
        : await identifyProblem(this.thought.text, existingNames, this.settings, this.usageCollector);

      if (!cached) {
        this.trajectory.push(
          `\`identifyProblem\` returned: status=${result.status}`
          + (result.problemName ? `, problemName="${result.problemName}"` : '')
          + (result.isNew !== undefined ? `, isNew=${result.isNew}` : '')
          + (result.confidence !== undefined ? `, confidence=${result.confidence}` : '')
          + (result.message ? `, message="${result.message}"` : '')
        );
        this._cacheSet(identifyCacheKey, result);
      }

      this._step1Result = result;
      this.renderStep1Result(result, statusEl, buttonRow);
    } catch (error) {
      this.trajectory.push(`\`identifyProblem\` threw: ${error.message}`);
      statusEl.setText(`Error: ${error.message}`);
    }
  }

  renderStep1Result(result, statusEl, buttonRow) {
    buttonRow.empty();

    if (result.status === 'no-api-key') {
      this.trajectory.push('Step 1 displayed: no API key — showed prompt to add key');
      statusEl.setText('Add an Anthropic API key in plugin settings to identify problems.');
      this.addSkipButton(buttonRow);
      return;
    }

    if (result.status === 'empty') {
      this.trajectory.push('Step 1 displayed: no thought text found');
      statusEl.setText('No thought text found — try selecting text or placing your cursor on a line.');
      this.addCloseButton(buttonRow, 'Close');
      return;
    }

    if (result.status === 'unidentified' || result.status === 'error') {
      this.trajectory.push(`Step 1 displayed: could not identify problem (${result.status}) — showed manual input`);
      statusEl.setText(
        result.status === 'error'
          ? `Could not identify problem: ${result.message}`
          : 'Could not identify a specific problem.'
      );
      this.addProblemInput(buttonRow, '');
      this.addSkipButton(buttonRow);
      return;
    }

    // status === 'matched'
    this.trajectory.push(
      `Step 1 displayed: ${result.isNew ? 'new' : 'existing'} problem [[${result.problemName}]] — showed Accept / Edit / Skip`
    );
    const label = result.isNew
      ? `New problem: "${result.problemName}"`
      : `Problem: "${result.problemName}"`;
    statusEl.setText(label);

    // Accept button
    const acceptBtn = buttonRow.createEl('button', {
      text: result.isNew ? 'Create & accept' : 'Accept',
      cls: 'mod-cta',
    });
    acceptBtn.addEventListener('click', async () => {
      if (this.problemName !== result.problemName) this._step2Data = null;
      this.problemName = result.problemName;
      this.trajectory.push(`User accepted problem: [[${result.problemName}]]`);
      if (result.isNew) await ensureProblemPage(this.app, result.problemName);
      this.renderStep2();
    });

    // Edit button — lets user type a different name
    const editBtn = buttonRow.createEl('button', { text: 'Edit' });
    editBtn.addEventListener('click', () => {
      this.trajectory.push(`User clicked Edit on [[${result.problemName}]]`);
      statusEl.empty();
      this.addProblemInput(buttonRow, result.problemName);
      editBtn.remove();
      acceptBtn.remove();
    });

    this.addSkipButton(buttonRow);
  }

  addProblemInput(buttonRow, initialValue) {
    const { contentEl } = this;
    const inputRow = contentEl.createDiv({ cls: 'll-input-row' });
    const input = inputRow.createEl('input', { type: 'text', value: initialValue, cls: 'll-problem-input' });
    input.placeholder = 'Problem name…';
    input.focus();

    const confirmBtn = inputRow.createEl('button', { text: 'Use this', cls: 'mod-cta' });
    confirmBtn.addEventListener('click', async () => {
      const name = input.value.trim();
      if (!name) { new Notice('Please enter a problem name.'); return; }
      if (this.problemName !== name) this._step2Data = null;
      this.problemName = name;
      if (this._step1Result) this._step1Result = { ...this._step1Result, problemName: name, isNew: false };
      this.trajectory.push(`User manually entered problem name: [[${name}]]`);
      await ensureProblemPage(this.app, name);
      inputRow.remove();
      buttonRow.empty();
      this.renderStep2();
    });
  }

  addSkipButton(buttonRow) {
    const skipBtn = buttonRow.createEl('button', { text: 'Skip' });
    skipBtn.addEventListener('click', () => {
      this.trajectory.push('User skipped problem identification');
      this.problemName = null;
      this.renderStep2();
    });
  }

  addCloseButton(buttonRow, label = 'Close') {
    const btn = buttonRow.createEl('button', { text: label });
    btn.addEventListener('click', () => this.close());
  }

  // ─── Step 2: Page retrieval ────────────────────────────────────────────────

  async renderStep2() {
    const { contentEl } = this;
    contentEl.empty();
    this.step = 2;
    this.step2Visited = true;
    this.renderNavBar();

    if (this.thought.text) {
      contentEl.createEl('p', { text: 'You said', cls: 'll-thought-label' });
      contentEl.createEl('blockquote', { text: this.thought.text, cls: 'll-thought' });
    }
    contentEl.createEl('h2', { text: 'What has helped before' });

    // Use cached Step 2 data if the problem name hasn't changed
    let step2Data = this._step2Data;
    if (!step2Data || step2Data.forProblem !== this.problemName) {
      const statusEl = contentEl.createEl('p', { text: 'Searching…', cls: 'll-status' });

      const mentionedNames = this.problemName ? [this.problemName] : [];
      const retrievePages = getRetrievePages(this.app, mentionedNames);
      this.trajectory.push(
        `Called \`getRetrievePages\` for ${mentionedNames.map(n => `[[${n}]]`).join(', ') || '(none)'} → `
        + (retrievePages.length ? retrievePages.map(p => `[[${p.name}]]`).join(', ') : '(none)')
      );

      const queryIndex = buildQueryIndex(this.app);
      this.trajectory.push(
        `Called \`buildQueryIndex\` → ${queryIndex.length} entries across ${new Set(queryIndex.map(e => e.page)).size} problems: `
        + (queryIndex.length
          ? queryIndex.map(e => `"${e.query}" → [[${e.page}]]`).join(', ')
          : '(no queries indexed yet)')
      );

      const excludeNames = retrievePages.map(p => p.name);
      const searchCacheKey = `sp:${this.thought.text}|${queryIndex.map(e => `${e.query}->${e.page}`).sort().join(',')}`;
      this.trajectory.push(
        `Called \`searchProblems\` with utterance, ${queryIndex.length}-entry index`
        + (excludeNames.length ? `, excluding ${excludeNames.map(n => `[[${n}]]`).join(', ')}` : '')
      );
      const cachedSearch = this._cacheGet(searchCacheKey);
      let aiMatches, warning;
      if (cachedSearch) {
        ({ matches: aiMatches, warning } = cachedSearch);
        this.trajectory.push('`searchProblems` result served from cache');
      } else {
        ({ matches: aiMatches, warning } = await searchProblems(
          this.thought.text,
          queryIndex,
          excludeNames,
          this.settings,
          this.usageCollector,
        ));
        this._cacheSet(searchCacheKey, { matches: aiMatches, warning });
      }
      this.trajectory.push(
        `\`searchProblems\` returned: matches: ${aiMatches.map(n => `[[${n}]]`).join(', ') || '(none)'}`
        + (warning ? `, warning="${warning}"` : '')
      );

      const allPageNames = [
        ...(this.problemName ? [this.problemName] : []),
        ...retrievePages.map(p => p.name),
        ...aiMatches,
      ].filter((name, i, arr) => arr.indexOf(name) === i);
      this.trajectory.push(`Pages surfaced: ${allPageNames.map(n => `[[${n}]]`).join(', ') || '(none)'}`);

      const summaries = await Promise.all(
        allPageNames.map(async name => {
          const solutions = await readProblemSummary(this.app, name) ?? [];
          this.trajectory.push(
            `\`readProblemSummary\` for "${name}" → ${solutions.length} solution(s)`
            + (solutions.length ? ': ' + solutions.map(s => `"${s.text}"`).join(', ') : '')
          );
          return { name, solutions };
        })
      );

      step2Data = { summaries, allPageNames, warning, forProblem: this.problemName };
      this._step2Data = step2Data;
      statusEl.remove();
    }

    const { summaries, allPageNames, warning } = step2Data;

    if (warning) {
      contentEl.createEl('p', { text: warning, cls: 'll-warning' });
    }

    // Log what Step 2 is about to display
    this.trajectory.push(
      `Step 2 displayed: ${summaries.length} card(s) — `
      + (summaries.length
        ? summaries.map(({ name, solutions }) =>
            `[[${name}]] (${solutions.length} solution(s)${solutions.length ? ': ' + solutions.map(s => `"${s.text}"`).join(', ') : ''})`
          ).join('; ')
        : 'none')
    );

    if (summaries.length === 0) {
      contentEl.createEl('p', {
        text: 'No related pages found yet. Log solutions as you find them and they\'ll show up here.',
        cls: 'll-status',
      });
    }

    // Render a card for every surfaced page; indicate when no solutions exist
    const selected = new Set(allPageNames); // all selected by default
    const cardsContainer = contentEl.createDiv({ cls: 'll-cards-container' });

    const renderCard = (name, solutions) => {
      const card = cardsContainer.createDiv({ cls: 'll-page-card' });
      const cardHeader = card.createDiv({ cls: 'll-page-card-header' });
      cardHeader.createEl('strong', { text: name });
      const toggle = cardHeader.createEl('input', { type: 'checkbox' });
      toggle.checked = true;
      toggle.addEventListener('change', () => {
        if (toggle.checked) selected.add(name);
        else selected.delete(name);
      });

      if (solutions.length === 0) {
        card.createEl('p', { text: 'No solutions logged yet.', cls: 'll-muted' });
        return;
      }

      for (const solution of solutions) {
        const solutionEl = card.createDiv({ cls: 'll-solution' });
        solutionEl.createEl('span', { text: solution.text, cls: 'll-solution-text' });

        const potentInstances = solution.instances.filter(i => i.detail).slice(-2);
        if (potentInstances.length > 0) {
          const instanceList = solutionEl.createEl('ul', { cls: 'll-instances' });
          for (const instance of potentInstances) {
            instanceList.createEl('li', {
              text: `${instance.date}: "${instance.detail}"`,
              cls: 'll-instance',
            });
          }
        } else if (solution.instances.length > 0) {
          solutionEl.createEl('span', {
            text: ` (tried ${solution.instances.length}×)`,
            cls: 'll-muted',
          });
        }
      }
    };

    for (const { name, solutions } of summaries) renderCard(name, solutions);

    // Add problem input — lets user manually surface additional pages
    const allProblemNames = listProblemNames(this.app);
    const datalistId = 'll-problem-suggestions';
    const datalist = contentEl.createEl('datalist');
    datalist.id = datalistId;

    const addRow = contentEl.createDiv({ cls: 'll-add-problem-row' });
    const addInput = addRow.createEl('input', {
      type: 'text',
      cls: 'll-add-problem-input',
      placeholder: 'Add a related problem…',
    });
    addInput.setAttribute('list', datalistId);

    const refreshDatalist = () => {
      datalist.empty();
      for (const name of allProblemNames) {
        if (!selected.has(name)) {
          const opt = datalist.createEl('option');
          opt.value = name;
        }
      }
    };
    refreshDatalist();

    const addBtn = addRow.createEl('button', { text: 'Add', cls: 'mod-cta' });
    const doAdd = async () => {
      const name = addInput.value.trim();
      if (!name) return;
      if (selected.has(name)) { addInput.value = ''; return; }
      if (!allProblemNames.includes(name)) { addInput.value = ''; return; }
      const solutions = await readProblemSummary(this.app, name) ?? [];
      selected.add(name);
      allPageNames.push(name);
      renderCard(name, solutions);
      this.trajectory.push(`User manually added page: [[${name}]]`);
      addInput.value = '';
      refreshDatalist();
    };
    addBtn.addEventListener('click', doAdd);
    addInput.addEventListener('keydown', e => { if (e.key === 'Enter') doAdd(); });

    // Done button
    const buttonRow = contentEl.createDiv({ cls: 'll-button-row' });
    const doneBtn = buttonRow.createEl('button', { text: 'Done', cls: 'mod-cta' });
    doneBtn.addEventListener('click', () => {
      this.selectedPages = [...selected];
      this.trajectory.push(`User clicked Done in Step 2`);
      this.close();
    });

    const skipBtn = buttonRow.createEl('button', { text: 'Skip' });
    skipBtn.addEventListener('click', () => {
      this.selectedPages = [];
      this.trajectory.push(`User skipped Step 2`);
      this.close();
    });

  }

  // ─── On close: write the trace record ─────────────────────────────────────

  onClose() {
    const { contentEl } = this;
    contentEl.empty();

    // Write the compact trace to the note.
    // problemName is written as its own line in writeTrace, so exclude it
    // from retrievedPages to avoid duplicating it.
    const relatedPages = this.selectedPages.filter(p => p !== this.problemName);
    this.trajectory.push(
      `User selected pages: ${this.selectedPages.map(n => `[[${n}]]`).join(', ') || '(none)'}`
    );
    this.trajectory.push(
      `Called \`writeTrace\` → thought="${this.thought.text}", problemName=${this.problemName ? `[[${this.problemName}]]` : 'null'}, retrievedPages: ${relatedPages.map(n => `[[${n}]]`).join(', ') || '(none)'}`
    );
    writeTrace(this.editor, {
      fromLine: this.thought.fromLine,
      toLine: this.thought.toLine,
      ch0: this.thought.ch0,
      ch1: this.thought.ch1,
      thought: this.thought.text,
      problemName: this.problemName,
      retrievedPages: relatedPages,
    });

    // Index the cue text on selected pages; remove it from unchecked pages
    if (this.thought.text) {
      const surfacedPages = this._step2Data?.allPageNames ?? [];
      const uncheckedPages = surfacedPages.filter(p => !this.selectedPages.includes(p));

      if (this.selectedPages.length > 0) {
        this.trajectory.push(
          `Called \`writeQueriesToPages\` → query="${this.thought.text}", pages: ${this.selectedPages.map(n => `[[${n}]]`).join(', ')}`
        );
        writeQueriesToPages(this.app, this.thought.text, this.selectedPages)
          .catch(err => console.warn('Learning Loop: failed to write queries', err));
      }

      if (uncheckedPages.length > 0) {
        this.trajectory.push(
          `Called \`removeQueriesFromPages\` → query="${this.thought.text}", pages: ${uncheckedPages.map(n => `[[${n}]]`).join(', ')}`
        );
        removeQueriesFromPages(this.app, this.thought.text, uncheckedPages)
          .catch(err => console.warn('Learning Loop: failed to remove queries', err));
      }
    }

    // Write combined usage + trajectory log
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

module.exports = { HelpModal };
