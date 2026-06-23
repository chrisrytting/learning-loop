'use strict';

/**
 * reminders/livePreview.js
 *
 * CodeMirror 6 editor extension that renders inline `@remind …` triggers as
 * interactive buttons while editing in Live Preview, where markdown
 * post-processors don't run on inline code.
 *
 * Clicking the button sets (or cancels) a reminder. Because CM6 gives us exact
 * document offsets, we stamp the `^id` block reference directly onto the
 * trigger's line via an editor transaction — no file re-read or text search.
 */

const { ViewPlugin, Decoration, WidgetType } = require('@codemirror/view');
const { RangeSetBuilder, StateEffect } = require('@codemirror/state');
const { editorInfoField, Notice } = require('obsidian');
const { parseInline, formatFireAt, makeId, trailingInlineId } = require('./parse');

// Inline code span containing an @remind trigger, backticks included.
const TRIGGER_RE = /`(@remind[^`\n]*)`/g;

// Dispatched after set/cancel to force a decoration rebuild even when the doc
// didn't change (e.g. cancelling only touches plugin settings).
const refreshReminders = StateEffect.define();

class ReminderButtonWidget extends WidgetType {
  constructor(raw, label, ctx, existing) {
    super();
    this.raw = raw;
    this.label = label;
    this.ctx = ctx;
    this.existing = existing; // pending reminder for this line, or null
  }

  eq(other) {
    return other.raw === this.raw
      && other.label === this.label
      && (other.existing?.id || null) === (this.existing?.id || null)
      && (other.existing?.fireAt || null) === (this.existing?.fireAt || null);
  }

  toDOM(view) {
    const btn = document.createElement('button');
    btn.className = 'learning-loop-reminder-inline-btn';
    if (this.existing) {
      btn.textContent = `⏰ ${formatFireAt(this.existing.fireAt)}`;
      btn.title = 'Click to cancel this reminder';
      btn.classList.add('is-set');
    } else {
      btn.textContent = `⏰ ${this.label}`;
    }
    // mousedown rather than click: keep the editor from stealing focus/selection
    // before our handler runs.
    btn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.onActivate(view, btn);
    });
    return btn;
  }

  ignoreEvent() {
    return false;
  }

  async onActivate(view, btn) {
    const { scheduler } = this.ctx;
    try {
      if (this.existing) {
        await scheduler.remove(this.existing.id);
        view.dispatch({ effects: refreshReminders.of(null) });
        new Notice('Learning Loop: reminder cancelled.');
        return;
      }

      const fresh = parseInline(this.raw);
      if (!fresh) { new Notice('Learning Loop: could not parse the reminder.'); return; }

      const file = view.state.field(editorInfoField, false)?.file;
      if (!file) { new Notice('Learning Loop: could not locate this note.'); return; }

      // Locate the trigger's line live, then ensure a trailing block id.
      const pos = view.posAtDOM(btn);
      const line = view.state.doc.lineAt(pos);
      let blockId = trailingInlineId(line.text);
      if (!blockId) {
        blockId = makeId();
        view.dispatch({ changes: { from: line.to, insert: ` ^${blockId}` } });
      }

      await scheduler.add({
        id: makeId(),
        path: file.path,
        blockId,
        body: fresh.body || 'Reminder',
        fireAt: fresh.when.fireAt,
      });
      // The doc change above already triggers a rebuild; nudge it anyway in case
      // the id already existed (no doc change).
      view.dispatch({ effects: refreshReminders.of(null) });
      new Notice(`Learning Loop: reminder set for ${formatFireAt(fresh.when.fireAt)}.`);
    } catch (e) {
      new Notice(`Learning Loop: could not update reminder — ${e.message}`);
    }
  }
}

function buildDecorations(view, ctx) {
  const builder = new RangeSetBuilder();
  const { selection } = view.state;
  const path = view.state.field(editorInfoField, false)?.file?.path || null;

  try {
    for (const { from, to } of view.visibleRanges) {
      const text = view.state.doc.sliceString(from, to);
      TRIGGER_RE.lastIndex = 0;
      let m;
      while ((m = TRIGGER_RE.exec(text)) !== null) {
        const start = from + m.index;
        const end = start + m[0].length;
        const parsed = parseInline(m[1]);
        if (!parsed) continue;

        // Cursor-on-line guard: if any selection range touches the token, leave
        // it as raw source so the user can edit it.
        let overlap = false;
        for (const r of selection.ranges) {
          if (r.from <= end && r.to >= start) { overlap = true; break; }
        }
        if (overlap) continue;

        // Is a reminder already set for this line? Match the line's trailing id.
        let existing = null;
        if (path) {
          const blockId = trailingInlineId(view.state.doc.lineAt(start).text);
          if (blockId) existing = ctx.scheduler.find(path, blockId);
        }

        builder.add(
          start,
          end,
          Decoration.replace({
            widget: new ReminderButtonWidget(m[1], parsed.when.label, ctx, existing),
          }),
        );
      }
    }
  } catch (e) {
    console.error('Learning Loop: reminder live-preview render failed —', e.message);
  }

  return builder.finish();
}

function reminderLivePreviewExtension(ctx) {
  return ViewPlugin.fromClass(
    class {
      constructor(view) {
        this.decorations = buildDecorations(view, ctx);
      }
      update(u) {
        const refreshed = u.transactions.some((t) =>
          t.effects.some((e) => e.is(refreshReminders)));
        if (u.docChanged || u.viewportChanged || u.selectionSet || refreshed) {
          this.decorations = buildDecorations(u.view, ctx);
        }
      }
    },
    { decorations: (v) => v.decorations },
  );
}

module.exports = { reminderLivePreviewExtension };
