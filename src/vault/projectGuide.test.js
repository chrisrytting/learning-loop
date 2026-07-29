'use strict';

const {
  findMissingProjectPages,
  writeMissingProjectPages,
  insertRoadmapTask,
} = require('./projectGuide');

const config = {
  outputPaths: {
    goal: 'Project/Goal.md',
    roadmap: 'Project/Roadmap.md',
    principles: 'Project/Principles.md',
  },
};

test('inserts a proposed checkbox at the end of an existing roadmap phase', () => {
  const result = insertRoadmapTask([
    '# Roadmap',
    '',
    '## Build the audience',
    '',
    '- [x] Define the audience',
    '',
    '## Introduce products',
    '',
    '- [ ] Poll the email list',
    '',
  ].join('\n'), {
    heading: 'Build the audience',
    task: 'Publish the first story-rich video',
  });

  expect(result.added).toBe(true);
  expect(result.content).toContain([
    '- [x] Define the audience',
    '- [ ] Publish the first story-rich video',
    '',
    '## Introduce products',
  ].join('\n'));
});

test('creates a clearly labeled section when the proposed heading is absent', () => {
  const result = insertRoadmapTask('# Roadmap\n', {
    heading: 'Later experiments',
    task: '- [ ] Test a project-plan download',
  });

  expect(result.content).toBe([
    '# Roadmap',
    '',
    '## Later experiments',
    '',
    '- [ ] Test a project-plan download',
    '',
  ].join('\n'));
});

test('does not add the same roadmap task twice', () => {
  const original = '# Roadmap\n\n## Build\n\n- [ ] Start the newsletter\n';
  const result = insertRoadmapTask(original, {
    heading: 'Build',
    task: 'Start the newsletter',
  });

  expect(result).toEqual({ content: original, added: false, reason: 'duplicate' });
});

test('creates only missing pages and rechecks before every write', async () => {
  const files = new Map([
    ['Project', null],
    ['Project/Goal.md', '# Existing goal\n'],
  ]);
  const adapter = {
    exists: jest.fn(async path => files.has(path)),
    mkdir: jest.fn(async path => files.set(path, null)),
    write: jest.fn(async (path, content) => files.set(path, content)),
  };
  const app = { vault: { adapter } };
  const missing = await findMissingProjectPages(app, config);
  const created = await writeMissingProjectPages(app, config, {
    roadmap: '# Draft roadmap',
    principles: '# Draft principles',
  }, missing);

  expect(missing).toEqual(['roadmap', 'principles']);
  expect(created).toEqual(['Project/Roadmap.md', 'Project/Principles.md']);
  expect(adapter.write).not.toHaveBeenCalledWith('Project/Goal.md', expect.anything());
  expect(files.get('Project/Goal.md')).toBe('# Existing goal\n');
});
