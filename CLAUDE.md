# Learning Loop — Claude Code Guide

## Project overview
An Obsidian plugin (JS/Node, built with esbuild) that helps users build a personal library of recurring problems and solutions. Core commands: **Help** (surface relevant past solutions) and **Log** (parse and file a new problem/solution).

## Key paths
- Source: `src/`
- Entry point: `src/main.js` → compiled to `main.js` at repo root
- Tests: `src/**/*.test.js` (Jest)
- Obsidian vault used for development: `/Users/chrisrytting/Tiny Obsidian`
- Plugin install location: `/Users/chrisrytting/Tiny Obsidian/.obsidian/plugins/learning-loop` (a symlink the **human** repoints by hand to whichever worktree they want to test — agents never touch it; see Worktree workflow)

## Build & test
```bash
npm run build   # compile src/ → main.js
npm test        # run Jest tests
```
After building, reload the plugin in Obsidian (disable/re-enable) to pick up changes.

## Worktree workflow
Feature work happens in git worktrees created under `.claude/worktrees/`.

**The Obsidian plugin symlink (`/Users/chrisrytting/Tiny Obsidian/.obsidian/plugins/learning-loop`) is human-owned. Agents must NEVER repoint it.** There is exactly one plugin slot in the vault, and only the human decides which worktree is being tested at any moment. An agent silently repointing it breaks whatever branch the human is currently testing in Obsidian. Agents build and run Jest inside their own worktree (neither needs the symlink); the human repoints the symlink by hand when they sit down to test a specific branch.

**When merging a branch into main and cleaning up**, use the `land-worktree` skill
(invoke `/land-worktree`) — it runs the whole sequence safely: merge → `npm run build`
→ remove the worktree → delete the branch, with safety checks before anything
irreversible. It does **not** touch the symlink: if Obsidian is using the
worktree being landed, the skill stops before removal and leaves the clean,
merged worktree and branch intact until the human switches away from it.

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
