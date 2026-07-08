'use strict';

const { LogConfirmModal } = require('./LogConfirmModal');

function makeModal(onSubmit = jest.fn()) {
  const modal = new LogConfirmModal({}, {
    problem: 'Left Out',
    problemCandidates: [{ name: 'FOMO', confidence: 0.88 }],
    solutions: [],
    instanceDetail: "I'm feeling left out",
    confidence: 0.9,
  }, onSubmit);
  modal.close = jest.fn();
  return modal;
}

test('create-new is the editable default selection', () => {
  const onSubmit = jest.fn();
  const modal = makeModal(onSubmit);
  modal.problem = 'Social Exclusion';
  modal.submit();
  expect(onSubmit).toHaveBeenCalledWith({ problem: 'Social Exclusion', solutions: [] });
});

test('an existing candidate can be selected instead', () => {
  const onSubmit = jest.fn();
  const modal = makeModal(onSubmit);
  modal.selectProblem(1);
  modal.submit();
  expect(onSubmit).toHaveBeenCalledWith({ problem: 'FOMO', solutions: [] });
});

test('choosing a numbered action selects and submits immediately', () => {
  const onSubmit = jest.fn();
  const modal = makeModal(onSubmit);
  modal.chooseProblem(1);
  expect(modal.selectedProblemIndex).toBe(1);
  expect(onSubmit).toHaveBeenCalledWith({ problem: 'FOMO', solutions: [] });
  expect(modal.close).toHaveBeenCalledTimes(1);
});
