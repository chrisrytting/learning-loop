'use strict';
module.exports = {
  requestUrl: jest.fn(),
  Plugin: class {},
  Modal: class { constructor(app) { this.app = app; } },
  PluginSettingTab: class {},
  Setting: class { setName() { return this; } setDesc() { return this; } addText() { return this; } addDropdown() { return this; } addButton() { return this; } addSlider() { return this; } },
  Notice: class {},
  SuggestModal: class {},
  TFile: class {},
};
