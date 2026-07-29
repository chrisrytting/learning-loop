'use strict';

jest.mock('../commands/help', () => ({ helpCommand: jest.fn() }));
jest.mock('../commands/log', () => ({ logCommand: jest.fn() }));
jest.mock('../commands/alpinePlus', () => ({ alpinePlusCommand: jest.fn() }));

const { alpinePlusCommand } = require('../commands/alpinePlus');
const { OptionsModal } = require('./OptionsModal');

test('choosing Alpine+ closes Options and opens the existing project guide command', () => {
  const app = {};
  const editor = {};
  const settings = { projectGuideAnthropicModel: 'test-model' };
  const modal = new OptionsModal(app, editor, settings);
  modal.close = jest.fn();

  modal.chooseAlpinePlus();

  expect(modal.close).toHaveBeenCalledTimes(1);
  expect(alpinePlusCommand).toHaveBeenCalledWith(app, editor, settings);
});
