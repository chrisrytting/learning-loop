'use strict';

const { AiUsageCollector } = require('../ai/usageCollector');
const { generateProjectPages, answerProjectCue } = require('../ai/projectGuide');
const { ALPINE_PLUS_GUIDE } = require('../projectGuides/alpinePlus');
const {
  findMissingProjectPages,
  readProjectSource,
  readProjectPages,
  writeMissingProjectPages,
  addRoadmapProposal,
} = require('../vault/projectGuide');
const { readThought, writeGuidanceTrace } = require('../vault/trace');
const { buildExecutionWikiLink } = require('../vault/executionLink');
const { writeCommandUsageLog } = require('../vault/logs');
const { ProjectGuideSetupModal, ProjectGuideModal } = require('../ui/ProjectGuideModal');

function projectPageLink(path, label) {
  return `[[${path.replace(/\.md$/i, '')}|${label}]]`;
}

function resultSections(result, roadmapUpdate) {
  const sections = [];
  if (result.roadmapLocation) {
    sections.push({ heading: 'Roadmap location', items: [result.roadmapLocation] });
  }
  if (result.implementationIdeas.length) {
    sections.push({ heading: 'Ways to do it', items: result.implementationIdeas });
  }
  if (result.principleApplications.length) {
    sections.push({
      heading: 'Principles to apply',
      items: result.principleApplications.map(item => `${item.principle}: ${item.application}`),
    });
  }
  if (roadmapUpdate) sections.push({ heading: 'Roadmap update', items: [roadmapUpdate] });
  return sections;
}

async function openProjectPage(app, path) {
  await app.workspace.openLinkText(path.replace(/\.md$/i, ''), '', true);
}

async function alpinePlusCommand(app, editor, settings) {
  const config = ALPINE_PLUS_GUIDE;
  const usageCollector = new AiUsageCollector({
    captureTranscripts: settings?.logAiTranscripts,
  });
  const executedAt = new Date();
  const thought = readThought(editor);
  const activeFile = app.workspace.getActiveFile();
  const executionLink = buildExecutionWikiLink(app, activeFile, thought.fromLine);
  const trajectory = [];
  let logged = false;

  const writeLog = async () => {
    if (logged) return;
    logged = true;
    await writeCommandUsageLog(app, {
      command: 'alpine-plus',
      executionLink,
      usages: usageCollector.usages,
      trajectoryEntries: trajectory,
      timestamp: executedAt,
    });
  };

  const missing = await findMissingProjectPages(app, config);
  if (missing.length) {
    const setupModal = new ProjectGuideSetupModal(app, {
      mode: 'loading',
      guideName: config.name,
    });
    setupModal.open();
    try {
      trajectory.push(`Found missing project pages: ${missing.join(', ')}`);
      const source = await readProjectSource(app, config);
      const generated = await generateProjectPages(source, missing, config, settings, usageCollector);
      const createdPaths = await writeMissingProjectPages(app, config, generated, missing);
      trajectory.push(`Created project pages: ${createdPaths.join(', ') || '(none; created elsewhere before write)'}`);
      setupModal.setPayload({
        mode: 'created',
        guideName: config.name,
        createdPaths,
        onOpenPage: path => openProjectPage(app, path),
      });
    } catch (error) {
      trajectory.push(`Project page setup failed: ${error.message}`);
      setupModal.setPayload({ mode: 'error', guideName: config.name, message: error.message });
    }
    await writeLog();
    return;
  }

  trajectory.push('All project pages already exist; opening the cue modal');
  const modal = new ProjectGuideModal(app, {
    guideName: config.name,
    initialCue: thought.text,
    onAsk: async cue => {
      trajectory.push(`User cue: ${cue}`);
      try {
        const pages = await readProjectPages(app, config);
        const result = await answerProjectCue(cue, pages, config, settings, usageCollector);
        trajectory.push(`Returned guidance for roadmap location: ${result.roadmapLocation || '(not specified)'}`);
        if (result.proposedRoadmapChange) {
          trajectory.push(`Proposed roadmap task under ${result.proposedRoadmapChange.heading}: ${result.proposedRoadmapChange.task}`);
        }
        return result;
      } catch (error) {
        trajectory.push(`Guidance request failed: ${error.message}`);
        throw error;
      }
    },
    onDone: async ({ cue, result, addToRoadmap }) => {
      let roadmapUpdate = '';
      if (addToRoadmap && result.proposedRoadmapChange) {
        const update = await addRoadmapProposal(app, config, result.proposedRoadmapChange);
        if (update.added) {
          roadmapUpdate = `Added “${update.task}” under “${update.heading}”.`;
          trajectory.push(`Confirmed roadmap addition: ${update.task}`);
        } else if (update.reason === 'duplicate') {
          roadmapUpdate = 'The proposed task was already present, so the Roadmap was not changed.';
          trajectory.push('Confirmed roadmap addition was skipped because it was already present');
        }
      } else if (result.proposedRoadmapChange) {
        roadmapUpdate = 'The proposed Roadmap change was not added.';
        trajectory.push('Roadmap proposal left unconfirmed');
      }

      writeGuidanceTrace(editor, {
        ...thought,
        thought: cue,
        heading: `${config.name} Guidance`,
        recommendation: result.answer,
        relatedPages: [
          projectPageLink(config.outputPaths.goal, `${config.name} Goal`),
          projectPageLink(config.outputPaths.roadmap, `${config.name} Roadmap`),
          projectPageLink(config.outputPaths.principles, `${config.name} Principles`),
        ],
        sections: resultSections(result, roadmapUpdate),
      });
      trajectory.push('Inserted project guidance into a Learning Loop Trace');
      await writeLog();
    },
    onCancel: () => {
      trajectory.push('Cancelled without inserting project guidance or changing the Roadmap');
      writeLog().catch(error => console.warn('Learning Loop: failed to write Alpine+ usage log', error));
    },
  });
  modal.open();
}

module.exports = { alpinePlusCommand, projectPageLink, resultSections };
