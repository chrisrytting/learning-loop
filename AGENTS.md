# Learning Loop — Codex Guide

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
npm run build   # one-shot production compile src/ → main.js (do this before landing)
npm test        # run Jest tests
```
After a one-shot build, reload the plugin in Obsidian (disable/re-enable) to pick up changes.

## Local development (watch mode)
For iterative work, **do not** run `npm run build` after every edit. Instead start the
esbuild watcher once, at the outset of working in a worktree:
```bash
scripts/dev.sh   # idempotent: starts the watcher if one isn't already running here
```
This rebuilds `main.js` on every save in `src/`; the Hot Reload Obsidian plugin then
reloads the plugin automatically. Run it in the worktree the vault symlink points at.
`scripts/dev.sh stop` stops this worktree's watcher.

## Worktree workflow
Feature work happens in git worktrees created under `.Codex/worktrees/`.

**The Obsidian plugin symlink (`/Users/chrisrytting/Tiny Obsidian/.obsidian/plugins/learning-loop`) is human-owned. Agents must NEVER repoint it.** There is exactly one plugin slot in the vault, and only the human decides which worktree is being tested at any moment. An agent silently repointing it breaks whatever branch the human is currently testing in Obsidian. Agents build and run Jest inside their own worktree (neither needs the symlink); the human repoints it by hand when they sit down to test a specific branch.

**When merging a branch into main and cleaning up**, use the `land-worktree` skill
(invoke `/land-worktree`) — it runs the whole sequence safely: merge → `npm run build`
→ remove the worktree → delete the branch, with safety checks before anything
irreversible. It does **not** touch the symlink: if the symlink dangles into the
removed worktree, the skill flags it in its summary and the human repoints it.

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

### UI completion checklist
Before calling modal or popover UI work complete, verify:
- Every primary or repeated action has a keyboard path.
- The shortcut is shown in the visible button/control label.
- Shortcuts are registered on the modal/popover scope, not document-global.
- Shortcuts do not fire while typing in input, textarea, or contenteditable fields.
- Multiline textareas keep `Enter` for newlines and use `Mod+Enter` for submit.
- Tests cover the shortcut mapping and the typing guard.

## AI provider
Supports Anthropic (Codex) and Ollama (local). All AI calls go through `callAI(settings, prompt, maxTokens, collector)` in `src/ai/client.js`. Pass an `AiUsageCollector` instance as the fourth argument to track token usage and cost.

## Cost logging
Every command run writes a timestamped note to `Logs/` in the vault with YAML frontmatter (timestamp, command, cost_usd, execution_link). `Logs/Overview.base` is an Obsidian Bases file that shows a table with cost totals.
