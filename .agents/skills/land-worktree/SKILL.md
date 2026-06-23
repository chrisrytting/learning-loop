---
name: land-worktree
description: >-
  Land a feature worktree into main and clean it up for the learning-loop
  Obsidian plugin: merge the branch into main, rebuild, repoint the Obsidian
  plugin symlink, remove the worktree, and delete the branch. Use this whenever
  the user wants to finish/land/ship a worktree, merge a worktree branch into
  main, "clean up" or "remove" a worktree after merging, or says things like
  "/land-worktree", "land this branch", "merge and clean up", or "I'm done with
  this worktree." Trigger even if they only name part of it (e.g. just "merge
  the worktree") — this skill does the whole sequence safely.
---

# Land a worktree into main

Automates the project's "merge a worktree branch into main and clean up"
workflow (documented in `AGENTS.md`). The goal is to make this a single,
safe, repeatable action so it can become muscle memory.

The main repo lives at `/Users/chrisrytting/code/learning-loop`. Feature work
happens in worktrees under `.Codex/worktrees/<name>` on branches named like
`Codex/<name>`. The Obsidian plugin symlink at
`/Users/chrisrytting/Tiny Obsidian/.obsidian/plugins/learning-loop` points at
whichever checkout is active and must end up pointing back at the main repo.

## Guiding principle

Destroying a worktree and deleting a branch are **irreversible**. Every step
that loses work (removing the worktree, deleting the branch) must be guarded by
a check that the work is safe. When in doubt, stop and ask — never force.

## Step 0 — Identify the target

Figure out which worktree and branch to land:

1. If the user named one, use it.
2. Otherwise run `git worktree list` from the main repo. If exactly one worktree
   exists under `.Codex/worktrees/`, that's the target. If there are several,
   show them and ask which one.

Record two things: the worktree path (`.Codex/worktrees/<name>`) and its branch
(the bracketed name in `git worktree list`, e.g. `Codex/<name>`).

## Step 1 — Safety check the worktree (do not skip)

Incomplete checks here have caused data loss before, so be thorough — this is
the same discipline as the `worktree-status` skill.

Run, from the main repo:

```bash
git -C .Codex/worktrees/<name> status --porcelain   # uncommitted changes?
git -C .Codex/worktrees/<name> log main..HEAD --oneline   # commits not yet on main
```

- **Uncommitted changes present:** stop. Tell the user what's uncommitted and
  ask whether to commit them (and with what message) or abort. Do not commit on
  your own — committing is the user's call (see `AGENTS.md`). If they approve,
  commit in the worktree, ending the message with:
  `Co-Authored-By: Codex Opus 4.8 <noreply@anthropic.com>`
- **No commits ahead of main:** there's nothing to land. Confirm with the user
  before proceeding (maybe they picked the wrong worktree).

## Step 2 — Merge into main

From the **main repo** (not the worktree):

```bash
git -C /Users/chrisrytting/code/learning-loop checkout main
git -C /Users/chrisrytting/code/learning-loop merge <branch>
```

If the merge reports conflicts, **stop** and report them — do not attempt to
resolve them as part of this workflow unless the user asks.

## Step 3 — Rebuild

```bash
cd /Users/chrisrytting/code/learning-loop && npm run build
```

If the build fails, stop and report. A broken build on main is worse than a
lingering worktree — don't continue the cleanup until it's green. Running
`npm test` here too is cheap insurance.

## Step 4 — Repoint the Obsidian symlink to main

```bash
ln -sfn "/Users/chrisrytting/code/learning-loop" "/Users/chrisrytting/Tiny Obsidian/.obsidian/plugins/learning-loop"
```

This matters because the symlink may currently point at the worktree you're
about to delete; leaving it dangling would break the plugin in Obsidian.

## Step 5 — Remove the worktree

```bash
git -C /Users/chrisrytting/code/learning-loop worktree remove .Codex/worktrees/<name>
```

If git refuses because the worktree has modifications, **do not** pass `--force`
blindly — that means Step 1 missed something. Re-inspect and resolve before
removing.

## Step 6 — Delete the branch

```bash
git -C /Users/chrisrytting/code/learning-loop branch -d <branch>
```

Use `-d` (not `-D`) on purpose: it refuses to delete a branch that isn't fully
merged, which is a last-line safety net. If it refuses, the merge didn't take —
investigate rather than forcing.

## Step 7 — Report

Summarize what happened: which branch was merged, that the build (and tests)
passed, that the symlink now points at main, and that the worktree and branch
were removed. Mention anything you skipped or that needs the user's attention
(e.g. "the plugin should be reloaded in Obsidian to pick up the merged build").
