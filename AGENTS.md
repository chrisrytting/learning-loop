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

## UI philosophy: keyboard-first interaction
Every modal and popover must be fully usable without reaching for the mouse. Mouse controls remain available, but the keyboard path should be the fastest and most obvious path.

- Give each choice a memorable single-key shortcut when appropriate, and show the key in the visible label (for example, **Help (H)** and **Log (L)**).
- `Enter` performs the modal's primary action; `Escape` cancels or closes without saving.
- Do not hijack ordinary typing. Single-key shortcuts should be inactive while the user is editing an input, textarea, or contenteditable element. In multiline fields, preserve `Enter` for newlines and use `Mod+Enter` for the primary action.
- Keep normal `Tab`/`Shift+Tab` focus order and ensure focused controls can be activated with `Enter` or `Space`.
- Register shortcuts in the modal's scoped keymap so they are removed when the modal closes. Avoid document-global listeners unless the interaction cannot be scoped.
- Add tests for shortcut mappings and for guards that prevent shortcuts from firing while the user is typing.

## AI provider
Supports Anthropic (Codex) and Ollama (local). All AI calls go through `callAI(settings, prompt, maxTokens, collector)` in `src/ai/client.js`. Pass an `AiUsageCollector` instance as the fourth argument to track token usage and cost.

## Cost logging
Every command run writes a timestamped note to `Logs/` in the vault with YAML frontmatter (timestamp, command, cost_usd, execution_link). `Logs/Overview.base` is an Obsidian Bases file that shows a table with cost totals.
