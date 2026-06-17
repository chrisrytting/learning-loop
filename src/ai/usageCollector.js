'use strict';

/**
 * ai/usageCollector.js
 *
 * Collects token usage across multiple callClaude() invocations within one command run.
 */

class AiUsageCollector {
  constructor() {
    /** @type {Array<{ inputTokens: number, outputTokens: number, model: string }>} */
    this.usages = [];
  }

  /**
   * @param {{ inputTokens: number, outputTokens: number, model: string }} usage
   */
  add(usage) {
    if (!usage || (!usage.inputTokens && !usage.outputTokens)) return;
    this.usages.push(usage);
  }

  hasUsage() {
    return this.usages.length > 0;
  }
}

module.exports = { AiUsageCollector };
