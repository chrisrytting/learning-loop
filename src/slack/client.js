'use strict';

/**
 * slack/client.js
 *
 * Thin wrapper around the Slack Web API using Obsidian's requestUrl.
 * All Slack calls go through here — nothing else calls requestUrl for Slack.
 */

const { requestUrl } = require('obsidian');

const BASE = 'https://slack.com/api';

async function slackPost(token, method, body = {}) {
  if (!token) throw new Error('No Slack Bot Token — add one in plugin settings.');
  const response = await requestUrl({
    url: `${BASE}/${method}`,
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`Slack HTTP error ${response.status}`);
  }
  const data = response.json;
  if (!data.ok) throw new Error(`Slack API error: ${data.error}`);
  return data;
}

async function slackGet(token, method, params = {}) {
  if (!token) throw new Error('No Slack Bot Token — add one in plugin settings.');
  const query = new URLSearchParams(params).toString();
  const url = `${BASE}/${method}${query ? '?' + query : ''}`;
  const response = await requestUrl({
    url,
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`Slack HTTP error ${response.status}`);
  }
  const data = response.json;
  if (!data.ok) throw new Error(`Slack API error: ${data.error}`);
  return data;
}

/**
 * List all channels the bot has access to.
 * @param {string} token
 * @returns {Promise<Array<{id, name}>>}
 */
async function listChannels(token) {
  const data = await slackGet(token, 'conversations.list', {
    types: 'public_channel,private_channel',
    exclude_archived: 'true',
    limit: '200',
  });
  return (data.channels || []).map(c => ({ id: c.id, name: c.name }));
}

/**
 * Fetch recent messages from a channel.
 * @param {string} token
 * @param {string} channelId
 * @param {number} limit   number of messages (max 200)
 * @returns {Promise<Array<{ts, user, text, thread_ts}>>}
 */
async function fetchMessages(token, channelId, limit = 50) {
  if (!channelId) throw new Error('No Slack channel ID provided.');
  const data = await slackGet(token, 'conversations.history', {
    channel: channelId,
    limit: String(Math.min(limit, 200)),
  });
  return (data.messages || []).map(m => ({
    ts: m.ts,
    user: m.user || m.bot_id || 'unknown',
    text: m.text || '',
    thread_ts: m.thread_ts,
  }));
}

/**
 * Fetch replies in a thread.
 * @param {string} token
 * @param {string} channelId
 * @param {string} threadTs
 * @returns {Promise<Array<{ts, user, text}>>}
 */
async function fetchThread(token, channelId, threadTs) {
  const data = await slackGet(token, 'conversations.replies', {
    channel: channelId,
    ts: threadTs,
  });
  return (data.messages || []).map(m => ({
    ts: m.ts,
    user: m.user || m.bot_id || 'unknown',
    text: m.text || '',
  }));
}

/**
 * Resolve a user ID to a display name.
 * @param {string} token
 * @param {string} userId
 * @returns {Promise<string>}
 */
async function resolveUsername(token, userId) {
  const data = await slackGet(token, 'users.info', { user: userId });
  return data.user?.profile?.display_name || data.user?.real_name || userId;
}

/**
 * Join a public channel. Safe to call if already a member.
 * @param {string} token
 * @param {string} channelId
 */
async function joinChannel(token, channelId) {
  await slackPost(token, 'conversations.join', { channel: channelId });
}

module.exports = { listChannels, joinChannel, fetchMessages, fetchThread, resolveUsername };
