'use strict';

let mockSetupInstance;
let mockProjectOptions;

jest.mock('../ai/projectGuide', () => ({
  generateProjectPages: jest.fn(),
  answerProjectCue: jest.fn(),
}));
jest.mock('../vault/projectGuide', () => ({
  findMissingProjectPages: jest.fn(),
  readProjectSource: jest.fn(),
  readProjectPages: jest.fn(),
  writeMissingProjectPages: jest.fn(),
  addRoadmapProposal: jest.fn(),
}));
jest.mock('../vault/trace', () => ({
  readThought: jest.fn(),
  writeGuidanceTrace: jest.fn(),
}));
jest.mock('../vault/executionLink', () => ({
  buildExecutionWikiLink: jest.fn(() => '[[Daily Note|Daily Note:1]]'),
}));
jest.mock('../vault/logs', () => ({
  writeCommandUsageLog: jest.fn(() => Promise.resolve()),
}));
jest.mock('../ui/ProjectGuideModal', () => ({
  ProjectGuideSetupModal: class {
    constructor(app, payload) {
      this.payload = payload;
      this.open = jest.fn();
      this.setPayload = jest.fn(next => { this.payload = next; });
      mockSetupInstance = this;
    }
  },
  ProjectGuideModal: class {
    constructor(app, options) {
      mockProjectOptions = options;
      this.open = jest.fn();
    }
  },
}));

const { generateProjectPages, answerProjectCue } = require('../ai/projectGuide');
const {
  findMissingProjectPages,
  readProjectSource,
  readProjectPages,
  writeMissingProjectPages,
  addRoadmapProposal,
} = require('../vault/projectGuide');
const { readThought, writeGuidanceTrace } = require('../vault/trace');
const { writeCommandUsageLog } = require('../vault/logs');
const { alpinePlusCommand } = require('./alpinePlus');

const thought = {
  text: 'What should I do next?',
  fromLine: 0,
  toLine: 0,
  ch0: 0,
  ch1: 22,
};
const app = {
  workspace: {
    getActiveFile: () => ({ path: 'Daily Note.md', basename: 'Daily Note' }),
    openLinkText: jest.fn(),
  },
};

beforeEach(() => {
  jest.clearAllMocks();
  mockSetupInstance = null;
  mockProjectOptions = null;
  readThought.mockReturnValue(thought);
});

test('first run generates and writes only the missing project pages', async () => {
  findMissingProjectPages.mockResolvedValue(['roadmap']);
  readProjectSource.mockResolvedValue('Master plan');
  generateProjectPages.mockResolvedValue({ roadmap: '# Roadmap' });
  writeMissingProjectPages.mockResolvedValue(['Alpine+ structure/Roadmap.md']);

  await alpinePlusCommand(app, {}, {});

  expect(generateProjectPages).toHaveBeenCalledWith(
    'Master plan',
    ['roadmap'],
    expect.objectContaining({ name: 'Alpine+' }),
    {},
    expect.any(Object),
  );
  expect(writeMissingProjectPages).toHaveBeenCalledWith(
    app,
    expect.any(Object),
    { roadmap: '# Roadmap' },
    ['roadmap'],
  );
  expect(mockSetupInstance.setPayload).toHaveBeenCalledWith(expect.objectContaining({
    mode: 'created',
    createdPaths: ['Alpine+ structure/Roadmap.md'],
  }));
  expect(mockProjectOptions).toBeNull();
});

test('later runs ask from current pages and write confirmed guidance to a trace', async () => {
  findMissingProjectPages.mockResolvedValue([]);
  readProjectPages.mockResolvedValue({ goal: 'goal', roadmap: 'roadmap', principles: 'principles' });
  const result = {
    answer: 'Film a pilot project.',
    roadmapLocation: 'Phase 1',
    implementationIdeas: ['Open with a promised payoff.'],
    principleApplications: [{ principle: 'Hooks', application: 'Lead with the question.' }],
    proposedRoadmapChange: { heading: 'Phase 1', task: 'Film a pilot project.', rationale: '' },
  };
  answerProjectCue.mockResolvedValue(result);
  addRoadmapProposal.mockResolvedValue({ added: true, task: 'Film a pilot project.', heading: 'Phase 1' });

  await alpinePlusCommand(app, {}, {});
  expect(mockProjectOptions.initialCue).toBe('What should I do next?');

  await expect(mockProjectOptions.onAsk('I should film a project next')).resolves.toBe(result);
  await mockProjectOptions.onDone({ cue: 'I should film a project next', result, addToRoadmap: true });

  expect(readProjectPages).toHaveBeenCalled();
  expect(addRoadmapProposal).toHaveBeenCalledWith(app, expect.any(Object), result.proposedRoadmapChange);
  expect(writeGuidanceTrace).toHaveBeenCalledWith({}, expect.objectContaining({
    thought: 'I should film a project next',
    heading: 'Alpine+ Guidance',
    recommendation: 'Film a pilot project.',
  }));
  expect(writeCommandUsageLog).toHaveBeenCalledWith(app, expect.objectContaining({ command: 'alpine-plus' }));
});
