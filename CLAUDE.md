# Learning Loop — Claude Code Guide

## Project overview
An Obsidian plugin (JS/Node, built with esbuild) that helps users build a personal library of recurring problems and solutions. Core commands: **Help** (surface relevant past solutions) and **Log** (parse and file a new problem/solution).

## Key paths
- Source: `src/`
- Entry point: `src/main.js` → compiled to `main.js` at repo root
- Tests: `src/**/*.test.js` (Jest)
- Obsidian vault used for development: `/Users/chrisrytting/Tiny Obsidian`
- Plugin install location: `/Users/chrisrytting/Tiny Obsidian/.obsidian/plugins/learning-loop` (symlinked to whichever worktree is active)

## Build & test
```bash
npm run build   # compile src/ → main.js
npm test        # run Jest tests
```
After building, reload the plugin in Obsidian (disable/re-enable) to pick up changes.

## Worktree workflow
Feature work happens in git worktrees created under `.claude/worktrees/`. The Obsidian plugin symlink points to whichever worktree is active so changes are immediately testable.

**When merging a branch into main and cleaning up:**
1. Merge the branch: `git merge <branch>` from the main repo
2. Build: `npm run build`
3. Repoint the Obsidian symlink back to main: `ln -sfn "/Users/chrisrytting/code/learning-loop" "/Users/chrisrytting/Tiny Obsidian/.obsidian/plugins/learning-loop"`
4. Remove the worktree: `git worktree remove .claude/worktrees/<name>`
5. Delete the branch: `git branch -d <branch>`

## Architecture
- `src/ai/` — Claude/Ollama API calls, cost tracking, usage collection
- `src/commands/` — thin entry points for each Obsidian command
- `src/ui/` — Obsidian Modal subclasses
- `src/vault/` — all vault read/write logic (problems, logs, traces, execution links)
- `src/settings.js` — plugin settings tab
- `src/main.js` — plugin entry point, command registration

## AI provider
Supports Anthropic (Claude) and Ollama (local). All AI calls go through `callAI(settings, prompt, maxTokens, collector)` in `src/ai/client.js`. Pass an `AiUsageCollector` instance as the fourth argument to track token usage and cost.

## Cost logging
Every command run writes a timestamped note to `Logs/` in the vault with YAML frontmatter (timestamp, command, cost_usd, execution_link). `Logs/Overview.base` is an Obsidian Bases file that shows a table with cost totals.
