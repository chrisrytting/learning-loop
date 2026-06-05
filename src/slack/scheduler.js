'use strict';

/**
 * slack/scheduler.js
 *
 * Polls Slack on an interval, evaluates each new message against Values,
 * and appends results to Cartwheel/Slack Messages.md.
 */

const { Notice } = require('obsidian');
const { listChannels, joinChannel, fetchMessages, resolveUsername } = require('./client');
const { compareToValues } = require('../ai/compareToValues');
const { loadValuesPage, normalizeBasePath } = require('../vault/values');

const OUTPUT_PATH = 'Cartwheel/Slack Messages.md';

function formatDate(ts) {
  return new Date(Number(ts) * 1000).toLocaleString(undefined, {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

function scoreBar(score) {
  const filled = Math.round(score / 10);
  return '█'.repeat(filled) + '░'.repeat(10 - filled) + ` ${score}/100`;
}

async function appendToNote(app, text) {
  const exists = await app.vault.adapter.exists(OUTPUT_PATH);
  if (!exists) {
    const dir = OUTPUT_PATH.split('/').slice(0, -1).join('/');
    const dirExists = await app.vault.adapter.exists(dir);
    if (!dirExists) await app.vault.createFolder(dir);
    await app.vault.create(OUTPUT_PATH, text);
  } else {
    const file = app.vault.getAbstractFileByPath(OUTPUT_PATH);
    await app.vault.append(file, '\n' + text);
  }
}

/**
 * Fetch new messages since lastTs, evaluate each, append to the note.
 * Returns the ts of the most recent message processed (or lastTs if none).
 *
 * @param {import('obsidian').App} app
 * @param {object} settings
 * @param {string} lastTs  — unix timestamp string of last processed message
 * @returns {Promise<string>} updated lastTs
 */
async function runSlackCheck(app, settings, lastTs) {
  const { slackBotToken, slackMessageLimit, anthropicApiKey, basePathFolder } = settings;

  if (!slackBotToken) return lastTs;

  const channels = await listChannels(slackBotToken);
  if (!channels.length) return lastTs;

  // Collect all new messages across all channels, tagged with channel name
  const allNew = [];
  for (const channel of channels) {
    try {
      await joinChannel(slackBotToken, channel.id);
      const messages = await fetchMessages(slackBotToken, channel.id, slackMessageLimit);
      for (const m of messages) {
        if (!lastTs || Number(m.ts) > Number(lastTs)) {
          allNew.push({ ...m, channelName: channel.name });
        }
      }
    } catch (e) {
      console.warn(`Learning Loop: skipping #${channel.name} — ${e.message}`);
    }
  }

  // Process oldest-first across all channels
  const newMessages = allNew.sort((a, b) => Number(a.ts) - Number(b.ts));

  if (!newMessages.length) return lastTs;

  const loaded = await loadValuesPage(app, normalizeBasePath(basePathFolder));
  if (!loaded || loaded.values.length === 0) {
    new Notice('Learning Loop: Slack check skipped — no values loaded.');
    return lastTs;
  }

  let newestTs = lastTs;

  for (const msg of newMessages) {
    if (!msg.text.trim()) continue;

    let username = msg.user;
    try { username = await resolveUsername(slackBotToken, msg.user); } catch (_) {}

    const evaluation = await compareToValues(msg.text, loaded.values, anthropicApiKey);
    const dateStr = formatDate(msg.ts);

    let entry;
    if (evaluation.status === 'ok') {
      entry = [
        `## ${dateStr} — ${username} in #${msg.channelName}`,
        `> ${msg.text.replace(/\n/g, '\n> ')}`,
        '',
        `**Alignment:** ${scoreBar(evaluation.alignmentScore)}`,
        `**Rationale:** ${evaluation.rationale}`,
        '',
        '---',
      ].join('\n');
    } else {
      entry = [
        `## ${dateStr} — ${username} in #${msg.channelName}`,
        `> ${msg.text.replace(/\n/g, '\n> ')}`,
        '',
        `*Evaluation skipped: ${evaluation.message || evaluation.status}*`,
        '',
        '---',
      ].join('\n');
    }

    await appendToNote(app, entry);
    newestTs = msg.ts;
  }

  if (newMessages.length) {
    new Notice(`Learning Loop: evaluated ${newMessages.length} new Slack message(s).`);
  }

  return newestTs;
}

/**
 * Start the polling interval.
 * Returns a cleanup function that clears the interval.
 *
 * @param {import('obsidian').App} app
 * @param {object} settings   — live reference, read on each tick
 * @param {() => Promise<void>} saveSettings
 * @param {number} intervalMinutes
 * @returns {() => void} cleanup
 */
function startSlackScheduler(app, settings, saveSettings, intervalMinutes) {
  const ms = Math.max(1, intervalMinutes) * 60 * 1000;

  const tick = async () => {
    if (!settings.slackBotToken) return;
    try {
      const updated = await runSlackCheck(app, settings, settings.slackLastTs || '');
      if (updated !== settings.slackLastTs) {
        settings.slackLastTs = updated;
        await saveSettings();
      }
    } catch (e) {
      new Notice('Learning Loop Slack error: ' + e.message);
    }
  };

  const id = setInterval(tick, ms);
  return () => clearInterval(id);
}

module.exports = { startSlackScheduler, runSlackCheck };
