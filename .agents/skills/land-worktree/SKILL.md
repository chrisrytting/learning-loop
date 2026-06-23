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

The main repo lives at `/Users/chrisrytting/code/learning-loop`. Codex-managed
worktrees live under `$CODEX_HOME/worktrees` and normally start at a detached
HEAD; permanent or manually created worktrees may already have a branch. Use
`codex/<name>` for a branch created while landing. The Obsidian plugin symlink at
`/Users/chrisrytting/Tiny Obsidian/.obsidian/plugins/learning-loop` points at
whichever checkout is active and must end up pointing back at the main repo.

## Guiding principle

Destroying a worktree and deleting a branch are **irreversible**. Every step
that loses work (removing the worktree, deleting the branch) must be guarded by
a check that the work is safe. When in doubt, stop and ask — never force.

## Step 0 — Identify the target

Figure out which worktree and branch to land:

1. If the user named one, use it.
2. If the current working directory is a linked worktree for this repository,
   use it.
3. Otherwise run `git worktree list` from the main repo. If exactly one linked
   worktree is a plausible target, use it. If there are several, show them and
   ask which one.

Record the absolute worktree path and whether HEAD is attached to a branch or
detached. Do not assume every worktree already has a branch.

## Step 1 — Safety check the worktree (do not skip)

Incomplete checks here have caused data loss before, so be thorough — this is
the same discipline as the `worktree-status` skill.

Run, from the main repo:

```bash
git -C <worktree-path> status --porcelain
git -C <worktree-path> symbolic-ref --quiet --short HEAD
git -C <worktree-path> log main..HEAD --oneline
```

- **Detached HEAD:** this is normal for a Codex-managed worktree. Do not commit
  while detached. If there is work to preserve, stop and ask permission to
  create a branch, proposing a concise `codex/<name>` branch name. After the
  user approves, create it in place with:
  `git -C <worktree-path> switch -c <branch>`.
- **Uncommitted changes present:** stop and show the changed files. Ask whether
  to commit them, proposing a concise message, or abort. Do not infer commit
  permission from the request to land. After approval, stage only the reviewed
  work and commit in the worktree, ending the message with:
  `Co-Authored-By: Codex Opus 4.8 <noreply@anthropic.com>`.
- **Detached commits already ahead of main:** create the approved branch at the
  current HEAD before doing anything else so those commits become durable.
- **No commits ahead of main:** there's nothing to land. Confirm with the user
  before proceeding, unless approved uncommitted changes still need to be
  committed first.

After any approved branch creation and commit, repeat all three safety checks.
Continue only when the worktree is clean, HEAD is attached to the recorded
branch, and at least one commit is ahead of main.

## Step 2 — Merge into main

From the **main repo** (not the worktree):

```bash
git -C /Users/chrisrytting/code/learning-loop checkout main
git -C /Users/chrisrytting/code/learning-loop merge --no-edit <branch>
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
git -C /Users/chrisrytting/code/learning-loop worktree remove <worktree-path>
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
