---
name: land-worktree
description: >-
  Land a feature worktree into main and clean it up for the learning-loop
  Obsidian plugin: merge the branch into main, rebuild, remove the worktree, and
  delete the branch. Use this whenever
  the user wants to finish/land/ship a worktree, merge a worktree branch into
  main, "clean up" or "remove" a worktree after merging, or says things like
  "/land-worktree", "land this branch", "merge and clean up", or "I'm done with
  this worktree." Trigger even if they only name part of it (e.g. just "merge
  the worktree") — this skill does the whole sequence safely.
---

# Land a worktree into main

Automates the project's "merge a worktree branch into main and clean up"
workflow (documented in this repo's agent guide — `CLAUDE.md` for Claude,
`AGENTS.md` for Codex; they describe the same workflow). The goal is to make
this a single, safe, repeatable action so it can become muscle memory.

This skill is agent-neutral: wherever it says "your agent," use whichever tool
is running it (Claude or Codex) for branch naming and the commit co-author
trailer. Don't hard-code the other agent's conventions.

The main repo lives at `/Users/chrisrytting/code/learning-loop`. Worktrees may
live under `.claude/worktrees/<name>` (Claude) or `$CODEX_HOME/worktrees`
(Codex); discover the actual location with `git worktree list` rather than
assuming. Claude worktrees usually already have a branch (e.g. `claude/<name>`);
Codex-managed worktrees often start at a **detached HEAD**. The Obsidian plugin
symlink at `/Users/chrisrytting/Tiny Obsidian/.obsidian/plugins/learning-loop`
is **human-owned: this skill never repoints it** (see the agent guide). If it
currently resolves into the worktree being landed, stop before cleanup and ask
the human to switch it. Never remove Obsidian's active plugin worktree.

## Guiding principle

Invoking this skill is permission to perform the normal landing workflow end to
end: create a safety branch if needed, commit the target worktree's feature
changes, merge the branch into main, rebuild/test, remove the landed worktree,
and delete the merged branch. It does **not** authorize touching the Obsidian
plugin symlink — that is human-owned (see Step 4).

Destroying a worktree and deleting a branch are **irreversible**. Every step
that loses work must be guarded by a check that the work is safe. The guardrails
are for ambiguous or genuinely risky states, not for ordinary landing steps.
Keep the flow moving unless one of these checks fails:

- The target worktree is ambiguous.
- The main worktree has uncommitted files.
- The merge conflicts.
- Tests or build fail after merge.
- The Obsidian plugin symlink resolves into the target worktree.
- Git refuses to remove the worktree because it is not clean.
- Git refuses `branch -d`, meaning the branch is not fully merged.

Creating a branch to attach a detached HEAD and committing the target worktree's
reviewed feature diff are preservative landing steps. Destructive force options
are not authorized by this skill: never use `git reset --hard`, `git clean`,
`worktree remove --force`, or `branch -D` unless the user explicitly asks after
seeing the failure state. When in doubt, stop and ask — never force.

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
git -C /Users/chrisrytting/code/learning-loop status --porcelain
```

- **Detached HEAD:** normal for a Codex-managed worktree. Do not commit while
  detached. If there is work to preserve, create a branch automatically using a
  concise `<your-agent>/<name>` branch name (e.g. `claude/<name>` or
  `codex/<name>`), then report the branch name in the next update. The user's
  invocation of `land-worktree` is permission for this safety branch creation.
  Create it in place with: `git -C <worktree-path> switch -c <branch>`.
- **Uncommitted changes present in the target worktree:** show a concise status
  summary in the progress update, then commit them as part of the landing flow.
  Stage only the target worktree's current diff and commit with a concise
  feature-oriented message ending with the co-author trailer for whichever agent
  you are, e.g.:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` (Claude) or
  `Co-Authored-By: Codex Opus 4.8 <noreply@anthropic.com>` (Codex).
- **Detached commits already ahead of main:** create a safety branch at the
  current HEAD before doing anything else so those commits become durable.
- **No commits ahead of main and no uncommitted target worktree changes:**
  there's nothing to land. Stop and report that no landing action is needed
  (maybe the wrong worktree was picked).
- **Main has uncommitted changes:** stop and report them. Do not merge into a
  dirty main worktree.

After any branch creation and commit, repeat all safety checks. Continue only
when the target worktree is clean, HEAD is attached to the recorded branch, at
least one commit is ahead of main, and the main worktree is clean.

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

## Step 4 — Guard the active Obsidian worktree (do NOT repoint it)

The symlink is **human-owned** — never repoint it. Run the bundled read-only
guard before any cleanup:

```bash
bash <skill-directory>/scripts/check-active-worktree.sh <worktree-path>
```

The guard handles absolute and relative symlink targets, compares canonical
paths, and exits with status 2 when cleanup must stop. If it reports `BLOCKED`:

1. **Stop before Step 5.** Do not stop the worktree's watcher, remove the
   worktree, or delete its branch.
2. Report that the merge, build, and tests succeeded but cleanup is blocked
   because Obsidian is using this worktree.
3. Ask the human to use `Learning Loop: Switch Worktree` in Obsidian (or repoint
   the symlink manually) and invoke the landing workflow again.

This guard applies even when the merge into main has already succeeded. Leaving
the clean, merged worktree and branch in place is safe and makes a later cleanup
retry straightforward. A missing or dangling plugin symlink does not authorize
the skill to repair it; report it and stop for human intervention.

## Step 5 — Remove the worktree

First stop any esbuild dev watcher running in the worktree. A live watcher whose
working directory is inside the worktree can hold it busy and make removal fail;
this also reaps watchers left behind by sessions (e.g. Codex) that have no
SessionEnd hook to stop them. It is idempotent — a no-op if none is running.

```bash
bash <worktree-path>/scripts/dev.sh stop 2>/dev/null || true
```

Then remove the worktree:

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
passed, and that the worktree and branch were removed. If Step 4 stopped
cleanup, state prominently that the clean, merged worktree and branch remain
intact until the human switches Obsidian away from that worktree. Mention
anything else you skipped or that needs the user's attention (e.g. "the plugin
should be reloaded in Obsidian to pick up the merged build").
