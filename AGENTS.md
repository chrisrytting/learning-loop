# Learning Loop — Codex Guide

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
Feature work happens in git worktrees created under `.Codex/worktrees/`. The Obsidian plugin symlink points to whichever worktree is active so changes are immediately testable.

**When merging a branch into main and cleaning up**, use the `land-worktree` skill
(invoke `/land-worktree`) — it runs the whole sequence safely: merge → `npm run build`
→ repoint the Obsidian symlink to main → remove the worktree → delete the branch,
with safety checks before anything irreversible.

## Architecture
- `src/ai/` — Codex/Ollama API calls, cost tracking, usage collection
- `src/commands/` — thin entry points for each Obsidian command
- `src/ui/` — Obsidian Modal subclasses
- `src/vault/` — all vault read/write logic (problems, logs, traces, execution links)
- `src/settings.js` — plugin settings tab
- `src/main.js` — plugin entry point, command registration

## AI provider
Supports Anthropic (Codex) and Ollama (local). All AI calls go through `callAI(settings, prompt, maxTokens, collector)` in `src/ai/client.js`. Pass an `AiUsageCollector` instance as the fourth argument to track token usage and cost.

## Cost logging
Every command run writes a timestamped note to `Logs/` in the vault with YAML frontmatter (timestamp, command, cost_usd, execution_link). `Logs/Overview.base` is an Obsidian Bases file that shows a table with cost totals.
