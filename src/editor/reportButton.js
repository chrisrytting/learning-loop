'use strict';

/**
 * editor/reportButton.js
 *
 * A CodeMirror editor extension that renders a "＋ Report" button at the end of
 * every solution-reference line inside a Learning Loop Trace (live preview /
 * source mode). Clicking it opens the ReportModal; on save the typed outcome is
 * inserted as a nested bullet directly under the solution reference, recording
 * it as evidence of whether the solution worked.
 *
 * A solution reference is a list item that links to a solution block, e.g.
 *   \t\t- [[Some Problem#^a1b2c3|the solution text]]
 * We detect any indented list item containing a block-ref wikilink, which is
 * exactly what writeTrace() emits under "Related Solutions".
 */

const { ViewPlugin, Decoration, WidgetType } = require('@codemirror/view');
const { RangeSetBuilder } = require('@codemirror/state');
const { Notice } = require('obsidian');
const { ReportModal } = require('../ui/ReportModal');
const { appendEvidenceToSolution } = require('../vault/problems');

// Indented list item ("- " / "* ") containing a [[Page#^id|label]] block link.
// Captures: 1 indent, 2 page name, 3 solution block id, 4 display label.
const SOLUTION_LINE_RE =
  /^(\s+)[-*]\s+.*\[\[([^\]\n#|]+)#\^([^\]\n|]+)\|([^\]\n]+)\]\]/;

class ReportButtonWidget extends WidgetType {
  constructor(app, lineFrom, indent, page, solutionBlockId, label) {
    super();
    this.app = app;
    this.lineFrom = lineFrom;
    this.indent = indent;
    this.page = page;
    this.solutionBlockId = solutionBlockId;
    this.label = label;
  }

  // Widgets at the same spot with the same label are interchangeable; this lets
  // CodeMirror reuse DOM across updates instead of rebuilding every keystroke.
  eq(other) {
    return other.lineFrom === this.lineFrom && other.label === this.label;
  }

  toDOM(view) {
    const btn = document.createElement('button');
    btn.className = 'll-report-btn';
    btn.textContent = '＋ Report';
    btn.setAttribute('aria-label', 'Report a result for this solution');
    // Keep the editor selection from jumping when the button is pressed.
    btn.addEventListener('mousedown', (e) => e.preventDefault());
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      this.openReport(view);
    });
    return btn;
  }

  openReport(view) {
    new ReportModal(this.app, this.label, async (report) => {
      // Re-resolve the line from the stored start offset so we insert at the
      // right place even if the document shifted since the decoration was built.
      const line = view.state.doc.lineAt(this.lineFrom);

      // Write the report inline under the solution reference, tagging it with a
      // block id so it can be referenced from elsewhere.
      const reportId = Math.random().toString(36).slice(2, 8);
      const nested = `\n${this.indent}\t- ${report} ^${reportId}`;
      view.dispatch({ changes: { from: line.to, insert: nested } });

      // Add a reference to that report under the solution on its Problem page,
      // so the evidence lives with the solution and surfaces in future Help.
      const noteFile = this.app.workspace.getActiveFile();
      if (!noteFile) return;
      // A link to the note on its own line, with the report embedded under it,
      // so the Problem page shows when it happened and renders the report inline.
      const evidenceLines = [
        `\t\t- [[${noteFile.basename}]] ![[${noteFile.basename}#^${reportId}]]`,
      ];
      const ok = await appendEvidenceToSolution(
        this.app, this.page, this.solutionBlockId, evidenceLines,
      );
      if (!ok) {
        new Notice(`Couldn’t attach the report to [[${this.page}]] — saved it in this note only.`);
      }
    }).open();
  }

  ignoreEvent() {
    return false;
  }
}

function buildDecorations(app, view) {
  const builder = new RangeSetBuilder();
  for (const { from, to } of view.visibleRanges) {
    let pos = from;
    while (pos <= to) {
      const line = view.state.doc.lineAt(pos);
      const match = SOLUTION_LINE_RE.exec(line.text);
      if (match) {
        const [, indent, page, solutionBlockId, label] = match;
        builder.add(
          line.to,
          line.to,
          Decoration.widget({
            widget: new ReportButtonWidget(
              app, line.from, indent, page.trim(), solutionBlockId, label.trim(),
            ),
            side: 1,
          }),
        );
      }
      pos = line.to + 1;
    }
  }
  return builder.finish();
}

/**
 * Build the editor extension. Closes over `app` so widgets can open modals.
 * @param {import('obsidian').App} app
 */
function reportButtonExtension(app) {
  return ViewPlugin.fromClass(
    class {
      constructor(view) {
        this.decorations = buildDecorations(app, view);
      }
      update(update) {
        if (update.docChanged || update.viewportChanged || update.selectionSet) {
          this.decorations = buildDecorations(app, update.view);
        }
      }
    },
    { decorations: (v) => v.decorations },
  );
}

module.exports = { reportButtonExtension };
