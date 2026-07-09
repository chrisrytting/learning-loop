#!/usr/bin/env bash
#
# Start (or confirm) the esbuild watcher for THIS worktree so edits to src/ are
# rebuilt into main.js automatically. The Hot Reload Obsidian plugin then picks
# up the new main.js and reloads the plugin — no manual `npm run build` per edit.
#
# Idempotent and safe to run at the start of every session/worktree: if a
# watcher is already running here it does nothing. Only one watcher runs per
# worktree, tracked via .dev-server.pid.
#
# Usage:
#   scripts/dev.sh          start/confirm the watcher (backgrounded)
#   scripts/dev.sh stop     stop this worktree's watcher
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

PIDFILE="$REPO_ROOT/.dev-server.pid"
LOGFILE="$REPO_ROOT/.dev-server.log"

running() {
  [[ -f "$PIDFILE" ]] && kill -0 "$(cat "$PIDFILE" 2>/dev/null)" 2>/dev/null
}

if [[ "${1:-}" == "stop" ]]; then
  if running; then
    kill "$(cat "$PIDFILE")" && rm -f "$PIDFILE"
    echo "[dev.sh] stopped watcher for $REPO_ROOT"
  else
    rm -f "$PIDFILE"
    echo "[dev.sh] no watcher running for $REPO_ROOT"
  fi
  exit 0
fi

if running; then
  echo "[dev.sh] watcher already running (pid $(cat "$PIDFILE")) for $REPO_ROOT"
  exit 0
fi

# Launch dependency install (first run only) + the esbuild watcher, detached so
# a SessionStart hook or interactive caller returns immediately. All output goes
# to .dev-server.log. `exec node …` means the tracked PID *is* the watcher, so
# `stop` kills it cleanly.
nohup bash -c "
  cd \"$REPO_ROOT\"
  if [[ ! -d node_modules ]]; then
    echo '[dev.sh] node_modules missing — running npm install...'
    npm install
  fi
  echo '[dev.sh] starting esbuild watcher (node esbuild.config.mjs)...'
  exec node esbuild.config.mjs
" >"$LOGFILE" 2>&1 &

echo $! > "$PIDFILE"
echo "[dev.sh] started watcher (pid $(cat "$PIDFILE")) for $REPO_ROOT; logs at $LOGFILE"
