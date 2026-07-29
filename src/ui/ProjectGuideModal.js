'use strict';

const { Modal } = require('obsidian');
const { registerModalShortcuts } = require('./modalShortcuts');

class ProjectGuideSetupModal extends Modal {
  constructor(app, payload) {
    super(app);
    this.payload = payload;
  }

  onOpen() {
    this.contentEl.addClass('ll-project-guide-modal');
    this.contentEl.setAttr('tabindex', '-1');
    registerModalShortcuts(this.scope, {
      primary: () => { if (this.payload.mode !== 'loading') this.close(); },
      cancel: () => this.close(),
    });
    this.render();
    window.requestAnimationFrame(() => this.contentEl.focus());
  }

  setPayload(payload) {
    this.payload = payload;
    this.render();
  }

  render() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl('h2', { text: `${this.payload.guideName} Guide` });
    if (this.payload.mode === 'loading') {
      contentEl.createEl('p', { text: 'Creating the missing project pages from the input document…', cls: 'll-status' });
      return;
    }
    if (this.payload.mode === 'error') {
      contentEl.createEl('p', { text: this.payload.message, cls: 'll-warning' });
    } else {
      contentEl.createEl('p', {
        text: this.payload.createdPaths.length
          ? 'The missing working-draft pages were created. Edit them freely as the project develops.'
          : 'All project pages already existed, so none were overwritten.',
      });
      const list = contentEl.createEl('ul', { cls: 'll-project-page-list' });
      for (const path of this.payload.createdPaths) {
        const item = list.createEl('li');
        const open = item.createEl('button', { text: path.replace(/^.*\//, '').replace(/\.md$/i, '') });
        open.addEventListener('click', () => this.payload.onOpenPage(path));
      }
    }
    const row = contentEl.createDiv({ cls: 'll-button-row' });
    row.createEl('button', { text: 'Done (Enter)', cls: 'mod-cta' })
      .addEventListener('click', () => this.close());
  }

  onClose() {
    this.contentEl.empty();
  }
}

class ProjectGuideModal extends Modal {
  constructor(app, options) {
    super(app);
    this.guideName = options.guideName;
    this.initialCue = options.initialCue || '';
    this.onAsk = options.onAsk;
    this.onDone = options.onDone;
    this.onCancel = options.onCancel;
    this.mode = 'cue';
    this.cue = this.initialCue;
    this.result = null;
    this.error = '';
    this._finished = false;
    this._cancelNotified = false;
    this._closed = false;
  }

  onOpen() {
    this.contentEl.addClass('ll-project-guide-modal');
    this.contentEl.setAttr('tabindex', '-1');
    registerModalShortcuts(this.scope, {
      primary: () => this.handlePrimary(),
      cancel: () => this.cancel(),
    });
    this.render();
  }

  handlePrimary() {
    if (this.mode === 'cue') return this.submitCue();
    if (this.mode === 'result') return this.finish();
    return undefined;
  }

  render() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl('h2', { text: `${this.guideName} Guide` });
    if (this.mode === 'loading') return this.renderLoading();
    if (this.mode === 'result') return this.renderResult();
    return this.renderCue();
  }

  renderCue() {
    this.contentEl.createEl('p', {
      text: 'Ask about the next step, place a new idea on the roadmap, or explore how to do something using the project principles.',
      cls: 'll-hint',
    });
    const examples = this.contentEl.createEl('ul', { cls: 'll-project-guide-examples' });
    examples.createEl('li', { text: 'What should I do next?' });
    examples.createEl('li', { text: 'I think I need to start a weekly newsletter.' });
    examples.createEl('li', { text: 'I think I should build the course next.' });
    const textarea = this.contentEl.createEl('textarea', {
      cls: 'll-project-guide-cue',
      attr: { 'aria-label': `${this.guideName} cue` },
    });
    textarea.rows = 4;
    textarea.placeholder = 'What are you considering?';
    textarea.value = this.cue;
    textarea.addEventListener('input', () => { this.cue = textarea.value; });
    this.cueEl = textarea;
    if (this.error) this.contentEl.createEl('p', { text: this.error, cls: 'll-warning' });

    const row = this.contentEl.createDiv({ cls: 'll-button-row' });
    row.createEl('button', { text: 'Cancel (Esc)' }).addEventListener('click', () => this.cancel());
    row.createEl('button', { text: 'Ask (Mod+Enter)', cls: 'mod-cta' })
      .addEventListener('click', () => this.submitCue());
    window.requestAnimationFrame(() => textarea.focus());
  }

  renderLoading() {
    this.contentEl.createEl('p', { text: 'Reading the current Goal, Roadmap, and Principles…', cls: 'll-status' });
    this.contentEl.createEl('blockquote', { text: this.cue, cls: 'll-thought' });
  }

  renderResult() {
    const result = this.result;
    this.contentEl.createEl('blockquote', { text: this.cue, cls: 'll-thought' });
    this.contentEl.createEl('p', { text: result.answer, cls: 'll-project-guide-answer' });

    if (result.roadmapLocation) {
      const location = this.contentEl.createDiv({ cls: 'll-project-guide-section' });
      location.createEl('h3', { text: 'Roadmap location' });
      location.createEl('p', { text: result.roadmapLocation });
    }
    if (result.implementationIdeas.length) {
      this.renderListSection('Ways to do it', result.implementationIdeas);
    }
    if (result.principleApplications.length) {
      const section = this.contentEl.createDiv({ cls: 'll-project-guide-section' });
      section.createEl('h3', { text: 'Principles to apply' });
      const list = section.createEl('ul');
      for (const item of result.principleApplications) {
        const li = list.createEl('li');
        li.createEl('strong', { text: `${item.principle}: ` });
        li.appendText(item.application);
      }
    }

    if (result.proposedRoadmapChange) this.renderRoadmapProposal(result.proposedRoadmapChange);
    if (this.error) this.contentEl.createEl('p', { text: this.error, cls: 'll-warning' });

    const row = this.contentEl.createDiv({ cls: 'll-button-row' });
    row.createEl('button', { text: 'Cancel (Esc)' }).addEventListener('click', () => this.cancel());
    row.createEl('button', { text: 'Done (Enter)', cls: 'mod-cta' })
      .addEventListener('click', () => this.finish());
    window.requestAnimationFrame(() => this.contentEl.focus());
  }

  renderListSection(heading, items) {
    const section = this.contentEl.createDiv({ cls: 'll-project-guide-section' });
    section.createEl('h3', { text: heading });
    const list = section.createEl('ul');
    for (const item of items) list.createEl('li', { text: item });
  }

  renderRoadmapProposal(proposal) {
    const box = this.contentEl.createDiv({ cls: 'll-project-guide-proposal' });
    box.createEl('h3', { text: 'Proposed roadmap addition' });
    box.createEl('p', { text: `Place under “${proposal.heading}”.`, cls: 'll-hint' });
    const task = box.createEl('input', {
      cls: 'll-project-guide-task',
      attr: { type: 'text', 'aria-label': 'Proposed roadmap task' },
    });
    task.value = proposal.task;
    task.addEventListener('input', () => { proposal.task = task.value; });
    if (proposal.rationale) box.createEl('p', { text: proposal.rationale, cls: 'll-hint' });

    const confirm = box.createEl('label', { cls: 'll-project-guide-confirm' });
    const checkbox = confirm.createEl('input', { attr: { type: 'checkbox' } });
    checkbox.checked = Boolean(this.addToRoadmap);
    checkbox.addEventListener('change', () => { this.addToRoadmap = checkbox.checked; });
    confirm.createSpan({ text: 'Add this task to Roadmap when I press Done' });
  }

  async submitCue() {
    if (this.mode !== 'cue') return;
    if (this.cueEl) this.cue = this.cueEl.value;
    this.cue = this.cue.trim();
    if (!this.cue) {
      this.error = 'Enter a cue before asking.';
      this.render();
      return;
    }
    this.error = '';
    this.mode = 'loading';
    this.render();
    try {
      const result = await this.onAsk(this.cue);
      if (this._closed) return;
      this.result = result;
      this.mode = 'result';
      this.render();
    } catch (error) {
      if (this._closed) return;
      this.error = error.message;
      this.mode = 'cue';
      this.render();
    }
  }

  async finish() {
    if (this.mode !== 'result' || this._finished) return;
    this.error = '';
    try {
      await this.onDone({
        cue: this.cue,
        result: this.result,
        addToRoadmap: Boolean(this.addToRoadmap),
      });
      this._finished = true;
      this.close();
    } catch (error) {
      this.error = error.message;
      this.render();
    }
  }

  cancel() {
    this.notifyCancel();
    this.close();
  }

  notifyCancel() {
    if (this._finished || this._cancelNotified) return;
    this._cancelNotified = true;
    this.onCancel?.();
  }

  onClose() {
    this._closed = true;
    this.notifyCancel();
    this.contentEl.empty();
  }
}

module.exports = { ProjectGuideSetupModal, ProjectGuideModal };
