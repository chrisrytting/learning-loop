'use strict';

/**
 * reminders/reminders.js
 *
 * Durable, schedulable OS-level reminders attached to a spot in a note.
 *
 * A fenced ```learning-loop-reminder``` block renders a button. When the user
 * sets a reminder we:
 *   1. stamp a block reference (^reminder-<id>) after the code block so we can
 *      navigate back to the exact spot even after the note is edited,
 *   2. persist {id, path, blockId, body, fireAt} to plugin data, and
 *   3. arm a setTimeout.
 *
 * On fire we raise a real OS Notification; clicking it focuses Obsidian and
 * opens path#^blockId. All pending reminders are re-armed on plugin load.
 */

const { Notice } = require('obsidian');
const { reminderLivePreviewExtension } = require('./livePreview');
const {
  parseWhen, parseBlock, parseInline, formatFireAt, INLINE_PREFIX,
  makeId, locateInlineLine, trailingInlineId,
} = require('./parse');

const BLOCK_LANG = 'learning-loop-reminder';

// ---------------------------------------------------------------------------
// Block-reference stamping
// ---------------------------------------------------------------------------

/**
 * Read the block id stamped immediately after the code block whose source
 * section ends at `lineEnd` (the closing fence). Returns the id without the
 * leading caret, or null. A block id must sit on the very next line with no
 * blank line in between, otherwise Obsidian attaches it to an empty block
 * rather than the code block.
 */
async function readTrailingBlockId(app, file, lineEnd) {
  const lines = (await app.vault.read(file)).split('\n');
  const after = lines[lineEnd + 1];
  const m = after && after.match(/^\^(\S+)\s*$/);
  return m ? m[1] : null;
}

/**
 * Ensure a block reference exists immediately after the code block. Returns the
 * existing or newly written block id (without the leading caret).
 */
async function ensureBlockId(app, file, lineEnd) {
  const existing = await readTrailingBlockId(app, file, lineEnd);
  if (existing) return existing;

  const lines = (await app.vault.read(file)).split('\n');
  const id = makeId();
  // No blank line — the caret must be adjacent so it references the code block.
  lines.splice(lineEnd + 1, 0, `^${id}`);
  await app.vault.modify(file, lines.join('\n'));
  return id;
}

/**
 * Read the inline block id already stamped on the trigger's source line, or
 * null. Locates the line the same way `ensureInlineBlockId` does.
 */
async function readInlineBlockId(app, file, lineStart, lineEnd, needle, occurrence) {
  const lines = (await app.vault.read(file)).split('\n');
  const at = locateInlineLine(lines, lineStart, lineEnd, needle, occurrence);
  if (at < 0) return null;
  return trailingInlineId(lines[at]);
}

/**
 * Ensure an inline block id is appended to the trigger's source line. Returns
 * the existing or newly written id.
 */
async function ensureInlineBlockId(app, file, lineStart, lineEnd, needle, occurrence) {
  const lines = (await app.vault.read(file)).split('\n');
  const at = locateInlineLine(lines, lineStart, lineEnd, needle, occurrence);
  if (at < 0) throw new Error('could not locate the trigger line');

  const existing = trailingInlineId(lines[at]);
  if (existing) return existing;

  const id = makeId();
  lines[at] = lines[at].replace(/\s*$/, '') + ` ^${id}`;
  await app.vault.modify(file, lines.join('\n'));
  return id;
}

// ---------------------------------------------------------------------------
// Firing + navigation
// ---------------------------------------------------------------------------

function focusObsidian() {
  try {
    // Electron path is the only reliable way to bring the window forward on macOS.
    const { remote } = require('electron');
    const win = remote ? remote.getCurrentWindow() : null;
    if (win) { win.show(); win.focus(); return; }
  } catch (_) { /* fall through */ }
  try { window.focus(); } catch (_) {}
}

async function navigateTo(app, path, blockId) {
  focusObsidian();
  const link = blockId ? `${path}#^${blockId}` : path;
  try {
    await app.workspace.openLinkText(link, '', false);
  } catch (e) {
    new Notice(`Learning Loop: could not open reminder location — ${e.message}`);
  }
}

function fireNotification(app, reminder) {
  const body = reminder.body || 'Reminder';
  try {
    const n = new Notification('Learning Loop', { body });
    n.onclick = () => navigateTo(app, reminder.path, reminder.blockId);
  } catch (_) {
    // Notifications blocked/unavailable — fall back to an in-app toast.
    const notice = new Notice(`⏰ ${body}`, 0);
    notice.noticeEl.onclick = () => navigateTo(app, reminder.path, reminder.blockId);
  }
}

// ---------------------------------------------------------------------------
// Scheduler — owns the live timers and the persisted list
// ---------------------------------------------------------------------------

class ReminderScheduler {
  constructor(plugin) {
    this.plugin = plugin;
    this.app = plugin.app;
    this.timers = new Map(); // id -> timeout handle
  }

  list() {
    return this.plugin.settings.reminders || (this.plugin.settings.reminders = []);
  }

  find(path, blockId) {
    return this.list().find((r) => r.path === path && r.blockId === blockId);
  }

  async add(reminder) {
    this.list().push(reminder);
    await this.plugin.saveSettings();
    this.arm(reminder);
  }

  async remove(id) {
    const list = this.list();
    const idx = list.findIndex((r) => r.id === id);
    if (idx !== -1) {
      list.splice(idx, 1);
      await this.plugin.saveSettings();
    }
    this.disarm(id);
  }

  disarm(id) {
    const t = this.timers.get(id);
    if (t) { clearTimeout(t); this.timers.delete(id); }
  }

  arm(reminder) {
    this.disarm(reminder.id);
    const delay = reminder.fireAt - Date.now();
    const run = async () => {
      fireNotification(this.app, reminder);
      await this.remove(reminder.id);
    };
    // setTimeout caps at ~24.8 days; for longer waits, re-arm in chunks.
    const MAX = 2_000_000_000;
    if (delay > MAX) {
      this.timers.set(reminder.id, setTimeout(() => this.arm(reminder), MAX));
      return;
    }
    this.timers.set(reminder.id, setTimeout(run, Math.max(0, delay)));
  }

  /** Re-arm everything on load; fire anything already overdue. */
  armAll() {
    for (const r of this.list()) this.arm(r);
  }

  dispose() {
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
  }
}

// ---------------------------------------------------------------------------
// Markdown code-block rendering
// ---------------------------------------------------------------------------

function registerReminders(plugin) {
  const scheduler = new ReminderScheduler(plugin);
  plugin._reminderScheduler = scheduler;

  if (!plugin.settings.reminders) plugin.settings.reminders = [];
  scheduler.armAll();

  // Live Preview: render inline @remind triggers as buttons via a CM6 extension
  // (markdown post-processors don't run on inline code in Live Preview).
  plugin.registerEditorExtension(reminderLivePreviewExtension({ plugin, scheduler }));

  plugin.registerMarkdownCodeBlockProcessor(BLOCK_LANG, (src, el, ctx) => {
    el.empty();
    const wrap = el.createDiv({ cls: 'learning-loop-reminder' });
    // body is fixed by the source; fireAt is recomputed at click time so a
    // relative `in:` is measured from when the user actually sets the reminder,
    // not from when the block first rendered.
    const { when, body } = parseBlock(src);

    const render = async () => {
      wrap.empty();

      const info = ctx.getSectionInfo(el);
      const file = plugin.app.vault.getAbstractFileByPath(ctx.sourcePath);

      // Is a reminder already set for this exact block? Look up the block id
      // stamped right after the code block, then match it against the list.
      let existing = null;
      if (info && file) {
        const bid = await readTrailingBlockId(plugin.app, file, info.lineEnd);
        if (bid) existing = scheduler.find(ctx.sourcePath, bid);
      }

      if (existing) {
        wrap.createSpan({
          text: `⏰ Reminder set for ${formatFireAt(existing.fireAt)}`,
          cls: 'learning-loop-reminder-status',
        });
        const cancel = wrap.createEl('button', { text: 'Cancel' });
        cancel.onclick = async () => {
          await scheduler.remove(existing.id);
          render();
        };
        return;
      }

      if (!when) {
        wrap.createSpan({
          text: 'Add a first line like `in: 30m` or `at: 2026-06-22 15:00` to enable a reminder.',
          cls: 'learning-loop-reminder-hint',
        });
        return;
      }

      const btn = wrap.createEl('button', { text: `⏰ Remind me (${when.label})` });
      btn.onclick = async () => {
        if (!info || !file) {
          new Notice('Learning Loop: could not locate this block to set a reminder.');
          return;
        }
        // Recompute the fire time now, so `in: 1m` means one minute from this
        // click rather than from when the note was opened.
        const fresh = parseBlock(src);
        if (!fresh.when) {
          new Notice('Learning Loop: could not parse the reminder time.');
          return;
        }
        btn.disabled = true;
        try {
          const blockId = await ensureBlockId(plugin.app, file, info.lineEnd);
          await scheduler.add({
            id: makeId(),
            path: ctx.sourcePath,
            blockId,
            body: fresh.body || 'Reminder',
            fireAt: fresh.when.fireAt,
          });
          new Notice(`Learning Loop: reminder set for ${formatFireAt(fresh.when.fireAt)}.`);
          render();
        } catch (e) {
          btn.disabled = false;
          new Notice(`Learning Loop: could not set reminder — ${e.message}`);
        }
      };
    };

    render();
  });

  // Inline trigger: `@remind in:30m text` inside any nested block. Works where
  // fenced blocks can't (list items, callouts, quotes).
  plugin.registerMarkdownPostProcessor((el, ctx) => {
    const codes = Array.from(el.querySelectorAll('code'))
      .filter((c) => c.textContent.trim().startsWith(INLINE_PREFIX));
    if (!codes.length) return;

    const seen = Object.create(null);
    for (const code of codes) {
      const raw = code.textContent.trim();
      const parsed = parseInline(raw);
      // Track the occurrence index per identical trigger text, so duplicates in
      // the same section map to distinct source lines.
      const occurrence = seen[raw] = (seen[raw] ?? -1) + 1;
      if (!parsed) continue;
      renderInline(plugin, scheduler, ctx, el, code, raw, occurrence);
    }
  });

  return scheduler;
}

/** Replace an inline `@remind …` code span with the reminder button. */
function renderInline(plugin, scheduler, ctx, sectionEl, code, raw, occurrence) {
  const span = code.createSpan
    ? code.createSpan()
    : document.createElement('span');
  span.addClass?.('learning-loop-reminder-inline');
  code.replaceWith(span);

  const render = async () => {
    span.empty();
    const info = ctx.getSectionInfo(sectionEl);
    const file = plugin.app.vault.getAbstractFileByPath(ctx.sourcePath);

    let existing = null;
    if (info && file) {
      const bid = await readInlineBlockId(
        plugin.app, file, info.lineStart, info.lineEnd, raw, occurrence,
      );
      if (bid) existing = scheduler.find(ctx.sourcePath, bid);
    }

    if (existing) {
      const status = span.createSpan({
        text: `⏰ ${formatFireAt(existing.fireAt)}`,
        cls: 'learning-loop-reminder-status',
      });
      status.style.cursor = 'pointer';
      status.title = 'Click to cancel this reminder';
      status.onclick = async () => { await scheduler.remove(existing.id); render(); };
      return;
    }

    const parsed = parseInline(raw);
    const btn = span.createEl('button', { text: `⏰ ${parsed.when.label}` });
    btn.onclick = async () => {
      if (!info || !file) {
        new Notice('Learning Loop: could not locate this reminder to set it.');
        return;
      }
      // Recompute the fire time at click, so a relative `in:` counts from now.
      const fresh = parseInline(raw);
      if (!fresh) { new Notice('Learning Loop: could not parse the reminder.'); return; }
      btn.disabled = true;
      try {
        const blockId = await ensureInlineBlockId(
          plugin.app, file, info.lineStart, info.lineEnd, raw, occurrence,
        );
        await scheduler.add({
          id: makeId(),
          path: ctx.sourcePath,
          blockId,
          body: fresh.body || 'Reminder',
          fireAt: fresh.when.fireAt,
        });
        new Notice(`Learning Loop: reminder set for ${formatFireAt(fresh.when.fireAt)}.`);
        render();
      } catch (e) {
        btn.disabled = false;
        new Notice(`Learning Loop: could not set reminder — ${e.message}`);
      }
    };
  };

  render();
}

module.exports = {
  registerReminders,
  parseWhen,
  parseBlock,
  parseInline,
  locateInlineLine,
  trailingInlineId,
  formatFireAt,
  ReminderScheduler,
};
