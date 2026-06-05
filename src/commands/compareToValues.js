'use strict';

/**
 * commands/compareToValues.js
 *
 * Compare selected/cursor text against Values.md under the configured base path.
 * Presentation is delegated to presentCompareResult (swappable).
 */

const { Notice } = require('obsidian');
const { readThought } = require('../vault/trace');
const { loadValuesPage, ensureValuesFile, openValuesFile, normalizeBasePath } = require('../vault/values');
const { compareToValues } = require('../ai/compareToValues');
const { presentCompareResult } = require('../ui/presentCompareResult');
const { CompareValuesModal } = require('../ui/CompareValuesModal');

/**
 * @param {import('obsidian').App} app
 * @param {import('obsidian').Plugin} plugin
 */
async function openPluginSettings(app, plugin) {
  await app.setting.open();
  await app.setting.openTabById(plugin.manifest.id);
}

/**
 * @param {import('obsidian').App} app
 * @param {string} basePathFolder
 */
function makeOpenValuesHandler(app, basePathFolder) {
  return async () => {
    const path = await ensureValuesFile(app, basePathFolder);
    await openValuesFile(app, path);
  };
}

/**
 * @param {import('obsidian').App} app
 * @param {import('obsidian').Editor} editor
 * @param {{ anthropicApiKey: string, basePathFolder: string }} settings
 * @param {import('obsidian').Plugin} plugin
 * @param {{ presentResult?: typeof presentCompareResult }} [options]
 */
async function compareToValuesCommand(app, editor, settings, plugin, options = {}) {
  const present = options.presentResult ?? presentCompareResult;
  const basePathFolder = normalizeBasePath(settings.basePathFolder);
  const openValues = basePathFolder
    ? makeOpenValuesHandler(app, basePathFolder)
    : null;

  if (!basePathFolder) {
    present(app, {
      mode: 'setup',
      message: 'Choose a base-path folder in Learning Loop settings. Values.md in that folder lists the values to compare against.',
      onOpenSettings: () => openPluginSettings(app, plugin),
      onOpenValues: openValues,
    });
    return;
  }

  const thought = readThought(editor);
  if (!thought.text) {
    new Notice('Select text or place your cursor on a line describing the action.');
    return;
  }

  const loaded = await loadValuesPage(app, basePathFolder);
  if (loaded.status === 'missing' || loaded.values.length === 0) {
    await ensureValuesFile(app, basePathFolder);
    await openValuesFile(app, loaded.path);
    present(app, {
      mode: 'setup',
      message: loaded.status === 'missing'
        ? 'Created Values.md — add your values, then run Compare to Values again.'
        : 'Values.md is empty — add at least one value, then run the command again.',
      valuesPath: loaded.path,
      onOpenValues: openValues,
    });
    return;
  }

  const loadingModal = new CompareValuesModal(app, {
    mode: 'loading',
    actionText: thought.text,
  });
  loadingModal.open();

  const evaluation = await compareToValues(
    thought.text,
    loaded.values,
    settings.anthropicApiKey,
  );

  loadingModal.close();

  if (evaluation.status === 'no-api-key') {
    present(app, {
      mode: 'error',
      actionText: thought.text,
      message: 'Add an Anthropic API key in Learning Loop settings to run comparisons.',
      onOpenSettings: () => openPluginSettings(app, plugin),
      onOpenValues: openValues,
    });
    return;
  }

  if (evaluation.status === 'empty-values') {
    await openValuesFile(app, loaded.path);
    present(app, {
      mode: 'setup',
      message: 'No values found in Values.md — add your values and try again.',
      onOpenValues: openValues,
    });
    return;
  }

  if (evaluation.status !== 'ok') {
    present(app, {
      mode: 'error',
      actionText: thought.text,
      message: evaluation.message || 'Could not evaluate alignment.',
      onOpenValues: openValues,
    });
    return;
  }

  present(app, {
    mode: 'result',
    actionText: thought.text,
    alignmentScore: evaluation.alignmentScore,
    rationale: evaluation.rationale,
    valuesPath: loaded.path,
    onOpenValues: openValues,
  });
}

module.exports = { compareToValuesCommand, openPluginSettings };
