const { Plugin, parseFrontMatterTags, requestUrl } = require('obsidian');
const trace = require('./trace');
const retrieval = require('./retrieval');
const smartOpenRight = require('./smartOpenRight');
const syncInstructions = require('./syncInstructions');
const LearningLoopSettingTab = require('./settings');

const DEFAULT_SETTINGS = { anthropicApiKey: '', smartOpenOnCmdClick: false };
const PROBLEMS_DIR = 'Problems';
const ANTHROPIC_MODEL = 'claude-haiku-4-5-20251001';

function stripListMarker(text) {
  return text.replace(/^[\s\t]*[-*]?\s*/, '').trim();
}

function titleCaseProblemName(name) {
  return name
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function normalizeProblemName(name) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function parseProblemFile(fileName, content) {
  const solutions = [];
  for (const line of content.split('\n')) {
    const match = line.match(/^\t-\s+(.+?)\s*$/);
    if (match) solutions.push(match[1]);
  }
  return { file: fileName.replace(/\.md$/, ''), solutions };
}

function extractJsonObject(text) {
  const raw = String(text || '').replace(/^```[a-z]*\n?/i, '').replace(/```$/i, '').trim();
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) throw new Error('AI response did not contain a JSON object');
  return JSON.parse(raw.slice(start, end + 1));
}

function formatDateLink(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const weekday = date.toLocaleDateString('en-US', { weekday: 'long' });
  const dailyName = `${year}-${month}-${day}-${weekday}`;
  return `[[${year}/${month}/${dailyName}|${dailyName}]]`;
}

function buildProblemFile(problemName, solutions, instanceDetail, dateLink) {
  const lines = [`- ${problemName}`];
  for (const solution of solutions) {
    lines.push(`\t- ${solution}`);
    lines.push(`\t\t- ${dateLink}`);
    if (instanceDetail) lines.push(`\t\t\t- ${instanceDetail}`);
  }
  return lines.join('\n') + '\n';
}

function appendProblemLog(content, problemName, solutions, instanceDetail, dateLink) {
  if (!content.trim()) return buildProblemFile(problemName, solutions, instanceDetail, dateLink);

  const lines = content.replace(/\n*$/g, '').split('\n');
  for (const solution of solutions) {
    const solutionLine = `\t- ${solution}`;
    const existingIndex = lines.findIndex(line => line.trim() === solutionLine.trim() && line.startsWith('\t- '));
    const entryLines = [`\t\t- ${dateLink}`];
    if (instanceDetail) entryLines.push(`\t\t\t- ${instanceDetail}`);

    if (existingIndex === -1) {
      lines.push(solutionLine, ...entryLines);
      continue;
    }

    let insertIndex = lines.length;
    for (let i = existingIndex + 1; i < lines.length; i++) {
      if (/^\t-\s+/.test(lines[i])) {
        insertIndex = i;
        break;
      }
    }
    lines.splice(insertIndex, 0, ...entryLines);
  }

  return lines.join('\n') + '\n';
}

function createUnifiedDiff(oldContent, newContent, path) {
  const oldLines = oldContent ? oldContent.replace(/\n$/g, '').split('\n') : [];
  const newLines = newContent ? newContent.replace(/\n$/g, '').split('\n') : [];
  let start = 0;
  while (start < oldLines.length && start < newLines.length && oldLines[start] === newLines[start]) start++;
  let oldEnd = oldLines.length - 1;
  let newEnd = newLines.length - 1;
  while (oldEnd >= start && newEnd >= start && oldLines[oldEnd] === newLines[newEnd]) {
    oldEnd--;
    newEnd--;
  }
  const diff = [`--- ${path}`, `+++ ${path}`, `@@ -${start + 1},${Math.max(0, oldEnd - start + 1)} +${start + 1},${Math.max(0, newEnd - start + 1)} @@`];
  for (let i = start; i <= oldEnd; i++) diff.push(`-${oldLines[i]}`);
  for (let i = start; i <= newEnd; i++) diff.push(`+${newLines[i]}`);
  return diff.join('\n');
}

function confirmProblemLog(diff) {
  if (typeof window === 'undefined' || typeof window.confirm !== 'function') return true;
  return window.confirm(`${diff}\n\nLooks good?`);
}

class LearningLoopPlugin extends Plugin {
  enterInsertMode(editor) {
    const cm = editor.cm?.cm;
    if (!cm) return;
    cm.focus();
    window.CodeMirror?.Vim?.handleKey(cm, 'i', 'normal');
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  async onload() {
    await this.loadSettings();
    await this.syncVaultFiles();

    this.addCommand({
      id: 'smart-open-right',
      name: 'Smart Open Right',
      callback: () => this.smartOpenRightPane(),
    });

    if (this.settings.smartOpenOnCmdClick) this.setupCmdClickHandler();

    this.addSettingTab(new LearningLoopSettingTab(this.app, this));

    this.addRibbonIcon('repeat-2', 'Learning Loop: Help', () => {
      this.app.commands.executeCommandById('learning-loop:help');
    });

    this.addCommand({
      id: 'help',
      name: 'Help',
      icon: 'repeat-2',
      editorCallback: async (editor) => this.help(editor),
    });

    this.addCommand({
      id: 'check-keywords',
      name: 'Check selection for problem keywords',
      editorCallback: (editor) => {
        let text = editor.getSelection();
        if (!text) {
          const cursor = editor.getCursor();
          text = editor.getLine(cursor.line);
        }
        if (!text) return;

        const selectionLower = text.toLowerCase();
        const matches = [];

        const problemFiles = this.app.vault.getFiles().filter(
          (f) => f.path.startsWith('Problems/') && f.extension === 'md'
        );

        for (const file of problemFiles) {
          const cache = this.app.metadataCache.getFileCache(file);
          if (!cache || !cache.frontmatter) continue;

          const tags = parseFrontMatterTags(cache.frontmatter);
          if (!tags) continue;

          const matched = tags.some((tag) => {
            const keyword = tag.replace(/^#/, '').toLowerCase();
            return selectionLower.includes(keyword);
          });

          if (matched) {
            const name = file.basename;
            matches.push(`[[${name}]]`);
          }
        }

        if (matches.length === 0) return;

        const cursor = editor.getCursor('to');
        const currentLine = editor.getLine(cursor.line);
        const lineEnd = currentLine.length;

        // Match leading whitespace and optional list marker (- or *)
        const prefixMatch = currentLine.match(/^(\s*(?:[-*]\s)?)/);
        const prefix = prefixMatch ? prefixMatch[1] : '';

        const output = matches.map((m) => prefix + m).join('\n');
        const insertion = '\n' + output + '\n' + prefix;
        editor.replaceRange(insertion, { line: cursor.line, ch: lineEnd });

        const newLine = cursor.line + matches.length + 1;
        editor.setCursor({ line: newLine, ch: prefix.length });
      },
    });

    this.addCommand({
      id: 'log',
      name: 'Log Problem/Solution',
      editorCallback: async (editor) => this.log(editor),
    });
  }

  onunload() {
    this.teardownCmdClickHandler();
  }

  async help(editor) {
    const selection = editor.getSelection();
    const cursor = editor.getCursor();

    if (selection) {
      trace.createTraceFromSelection.call(this, editor);
      return;
    }

    const text = editor.getLine(cursor.line);
    const block = trace.findTraceBlock(editor, cursor.line);
    const insideBlock = Boolean(block);

    if (insideBlock) {
      const { blockStart, blockEnd } = block;
      const sections = trace.findTraceSections(editor, blockStart, blockEnd);
      const { thoughtLineIdx, responseLineIdx, llOutputLineIdx, reviewLineIdx } = sections;

      if (reviewLineIdx !== -1) {
        await trace.indexCues.call(this, editor, blockStart, blockEnd, thoughtLineIdx, responseLineIdx, llOutputLineIdx);
        return;
      }

      if (thoughtLineIdx === -1) return;

      if (responseLineIdx === -1) {
        trace.addResponse.call(this, editor, blockEnd);
        return;
      }

      await trace.runRetrieval.call(this, editor, thoughtLineIdx, responseLineIdx, blockEnd);
      return;
    }

    const currentLineIndented = editor.getLine(cursor.line).match(/^\s/);
    if (!text.replace(/[-\s]/g, '') && !(insideBlock && currentLineIndented)) {
      trace.createTrace.call(this, editor, cursor.line);
      return;
    }

    const thoughtText = stripListMarker(text);
    if (!thoughtText) return;
    trace.createTraceFromLine.call(this, editor, cursor, thoughtText);
  }

  async readProblemFiles() {
    const files = this.app.vault.getFiles()
      .filter(file => file.extension === 'md' && file.path.startsWith(`${PROBLEMS_DIR}/`));
    const entries = [];
    for (const file of files) {
      const content = await this.app.vault.adapter.read(file.path);
      entries.push(parseProblemFile(file.basename, content));
    }
    return entries;
  }

  async parseLogInput(input, problemFiles) {
    if (!this.settings.anthropicApiKey) {
      return { problem: '', solutions: [], instanceDetail: stripListMarker(input), confidence: 0 };
    }

    const instanceDetail = stripListMarker(input);
    const prompt = [
      'Extract a problem-solution log entry from the user input.',
      'Return ONLY raw JSON with this shape:',
      '{"problem":"Problem Name","solutions":["solution phrase"],"instanceDetail":"exact user wording without markdown bullet","confidence":0.0}',
      '',
      'Rules:',
      '- Use semantic interpretation. Do not rely on keyword-only matching.',
      '- Preserve instanceDetail exactly, except remove leading indentation and markdown list marker.',
      '- Problem should be the difficulty or symptom, title-cased, concise, and suitable as an Obsidian filename.',
      '- Solutions should be concise action phrases, without a leading subject like "I".',
      '- If an existing problem file clearly matches, use that file name exactly.',
      '- If either problem or solution is unclear, use an empty string/array and confidence below 0.5.',
      '',
      `Existing problem files and solutions: ${JSON.stringify(problemFiles)}`,
      `User input: ${JSON.stringify(instanceDetail)}`,
    ].join('\n');

    const response = await requestUrl({
      url: 'https://api.anthropic.com/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.settings.anthropicApiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 400,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`API error ${response.status}: ${response.text}`);
    }

    const parsed = extractJsonObject(response.json?.content?.[0]?.text);
    return {
      problem: typeof parsed.problem === 'string' ? titleCaseProblemName(parsed.problem) : '',
      solutions: Array.isArray(parsed.solutions)
        ? parsed.solutions.filter(solution => typeof solution === 'string' && solution.trim()).map(solution => solution.trim())
        : [],
      instanceDetail: typeof parsed.instanceDetail === 'string' && parsed.instanceDetail.trim()
        ? parsed.instanceDetail.trim()
        : instanceDetail,
      confidence: Number(parsed.confidence || 0),
    };
  }

  findProblemDestination(problemName) {
    const normalizedProblem = normalizeProblemName(problemName);
    const files = this.app.vault.getFiles()
      .filter(file => file.extension === 'md' && file.path.startsWith(`${PROBLEMS_DIR}/`));
    const exact = files.find(file => normalizeProblemName(file.basename) === normalizedProblem);
    if (exact) return { path: exact.path, problemName: exact.basename };
    const title = titleCaseProblemName(problemName);
    return { path: `${PROBLEMS_DIR}/${title}.md`, problemName: title };
  }

  async log(editor) {
    const selectedText = editor.getSelection();
    const cursor = editor.getCursor();
    const input = selectedText || editor.getLine(cursor.line);
    const problemFiles = await this.readProblemFiles();
    const parsed = await this.parseLogInput(input, problemFiles);

    if (!parsed.problem || parsed.solutions.length === 0 || parsed.confidence < 0.5) {
      console.warn('Learning Loop log: AI could not infer both problem and solution from input.');
      return { status: 'needs-clarification', parsed };
    }

    const adapter = this.app.vault.adapter;
    if (!await adapter.exists(PROBLEMS_DIR)) await adapter.mkdir(PROBLEMS_DIR);
    const destination = this.findProblemDestination(parsed.problem);
    const exists = await adapter.exists(destination.path);
    const oldContent = exists ? await adapter.read(destination.path) : '';
    const dateLink = formatDateLink();
    const newContent = appendProblemLog(oldContent, destination.problemName, parsed.solutions, parsed.instanceDetail, dateLink);
    const diff = createUnifiedDiff(oldContent, newContent, destination.path);

    if (!confirmProblemLog(diff)) {
      return { status: 'canceled', path: destination.path, ...parsed, dateLink, diff };
    }

    await adapter.write(destination.path, newContent);
    return { status: 'logged', path: destination.path, problem: destination.problemName, ...parsed, dateLink, diff };
  }
}

Object.assign(
  LearningLoopPlugin.prototype,
  syncInstructions,
  retrieval,
  smartOpenRight,
  { extractCueText: trace.extractCueText },
);

module.exports = LearningLoopPlugin;
