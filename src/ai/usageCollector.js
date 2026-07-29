'use strict';

/**
 * ai/usageCollector.js
 *
 * Collects token usage across multiple callClaude() invocations within one command run.
 */

class AiUsageCollector {
  constructor(options = {}) {
    this.captureTranscripts = Boolean(options.captureTranscripts);
    /** @type {Array<{
     *   inputTokens: number,
     *   outputTokens: number,
     *   thinkingTokens?: number,
     *   model: string,
     *   purpose?: string,
     *   prompt?: string,
     *   response?: string,
     * }>} */
    this.usages = [];
  }

  /**
   * @param {{ inputTokens: number, outputTokens: number, model: string }} usage
   */
  add(usage) {
    const hasTranscript = typeof usage?.prompt === 'string' || typeof usage?.response === 'string';
    if (!usage || (!usage.inputTokens && !usage.outputTokens && !hasTranscript)) return;
    this.usages.push(usage);
  }

  hasUsage() {
    return this.usages.length > 0;
  }
}

module.exports = { AiUsageCollector };
