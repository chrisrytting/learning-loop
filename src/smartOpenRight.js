'use strict';

function smartOpenRightPane() {
  const workspace = this.app.workspace;
  const rootChildren = workspace.rootSplit.children;

  const activeContainer = workspace.activeLeaf?.parent;
  const activeIndex = rootChildren.indexOf(activeContainer);
  const rightIndex = activeIndex + 1;

  if (rightIndex < rootChildren.length) {
    const rightContainer = rootChildren[rightIndex];
    const rightLeaf = rightContainer.children ? rightContainer.children[0] : rightContainer;
    if (rightLeaf) workspace.setActiveLeaf(rightLeaf, { focus: true });
    return { created: false };
  } else {
    const newLeaf = workspace.getLeaf('split', 'vertical');
    workspace.setActiveLeaf(newLeaf, { focus: true });
    return { created: true };
  }
}

function setupCmdClickHandler() {
  const plugin = this;
  const workspace = this.app.workspace;
  const original = workspace.openLinkText.bind(workspace);
  this._originalOpenLinkText = original;

  workspace.openLinkText = async function(linktext, sourcePath, newLeaf, openState) {
    if (newLeaf === 'split') {
      const { created } = plugin.smartOpenRightPane();
      return original(linktext, sourcePath, created ? false : 'tab', openState);
    }
    return original(linktext, sourcePath, newLeaf, openState);
  };
}

function teardownCmdClickHandler() {
  if (this._originalOpenLinkText) {
    this.app.workspace.openLinkText = this._originalOpenLinkText;
    this._originalOpenLinkText = null;
  }
}

module.exports = {
  smartOpenRightPane,
  setupCmdClickHandler,
  teardownCmdClickHandler,
};
