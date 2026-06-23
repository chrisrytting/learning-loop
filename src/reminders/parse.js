'use strict';

/**
 * reminders/parse.js
 *
 * Pure parsing/formatting helpers shared by reminders.js (post-processor) and
 * livePreview.js (CM6 extension). Kept dependency-free so requiring it from
 * either side never forms a cycle.
 */

const UNIT_MS = {
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
};

/**
 * Parse a directive into an absolute fire time (ms).
 *   in: 30m | 2h | 1d | 90s   (relative to now)
 *   at: 2026-06-22 15:00      (absolute, parsed by Date)
 * Returns { fireAt, label } or null.
 */
function parseWhen(line, now = Date.now()) {
  const m = line.match(/^\s*(in|at)\s*:\s*(.+?)\s*$/i);
  if (!m) return null;
  const kind = m[1].toLowerCase();
  const value = m[2];

  if (kind === 'in') {
    const rel = value.match(/^(\d+(?:\.\d+)?)\s*([smhd])$/i);
    if (!rel) return null;
    const ms = parseFloat(rel[1]) * UNIT_MS[rel[2].toLowerCase()];
    if (!ms || ms <= 0) return null;
    return { fireAt: now + ms, label: `in ${value}` };
  }

  const parsed = Date.parse(value.replace(' ', 'T'));
  if (Number.isNaN(parsed)) return null;
  return { fireAt: parsed, label: `at ${value}` };
}

/** Split fenced-block source into { when, body }. Directive line is optional. */
function parseBlock(src, now = Date.now()) {
  const lines = src.replace(/\r/g, '').split('\n');
  let when = null;
  let bodyLines = lines;
  if (lines.length) {
    when = parseWhen(lines[0], now);
    if (when) bodyLines = lines.slice(1);
  }
  const body = bodyLines.join('\n').trim();
  return { when, body };
}

/**
 * Parse an inline trigger like `@remind in:30m Revisit the flaky test`.
 * First whitespace-delimited token is the directive; the rest is the body.
 */
function parseInline(raw, now = Date.now()) {
  const m = raw.trim().match(/^@remind\s+(\S+)\s*([\s\S]*)$/);
  if (!m) return null;
  const when = parseWhen(m[1], now);
  if (!when) return null;
  return { when, body: m[2].trim() };
}

function formatFireAt(fireAt) {
  return new Date(fireAt).toLocaleString(undefined, {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

const INLINE_PREFIX = '@remind';

/** Short, reasonably-unique id for block references and reminder records. */
function makeId() {
  return 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/**
 * Find the absolute file line for the `occurrence`-th line within
 * [lineStart, lineEnd] that contains `needle`. Returns -1 if not found.
 */
function locateInlineLine(fileLines, lineStart, lineEnd, needle, occurrence) {
  let count = -1;
  for (let i = lineStart; i <= lineEnd && i < fileLines.length; i++) {
    if (fileLines[i].includes(needle)) {
      count += 1;
      if (count === occurrence) return i;
    }
  }
  return -1;
}

/** Trailing inline block id on a line (`… ^abc`), or null. */
function trailingInlineId(line) {
  const m = line && line.match(/\s\^(\S+)\s*$/);
  return m ? m[1] : null;
}

module.exports = {
  parseWhen,
  parseBlock,
  parseInline,
  formatFireAt,
  makeId,
  locateInlineLine,
  trailingInlineId,
  INLINE_PREFIX,
};
