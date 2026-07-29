#!/usr/bin/env bash
set -euo pipefail

target_worktree="${1:?usage: check-active-worktree.sh <worktree-path> [plugin-symlink]}"
plugin_symlink="${2:-/Users/chrisrytting/Tiny Obsidian/.obsidian/plugins/learning-loop}"

block() {
  printf 'BLOCKED: %s\n' "$1" >&2
  exit 2
}

[[ -d "$target_worktree" ]] ||
  block "target worktree does not exist: $target_worktree"
[[ -L "$plugin_symlink" ]] ||
  block "Obsidian plugin path is not a symlink: $plugin_symlink"

raw_target="$(readlink "$plugin_symlink")" ||
  block "could not read Obsidian plugin symlink: $plugin_symlink"

if [[ "$raw_target" = /* ]]; then
  active_candidate="$raw_target"
else
  active_candidate="$(dirname "$plugin_symlink")/$raw_target"
fi

[[ -d "$active_candidate" ]] ||
  block "Obsidian plugin symlink is dangling: $plugin_symlink -> $raw_target"

target_real="$(cd "$target_worktree" && pwd -P)"
active_real="$(cd "$active_candidate" && pwd -P)"

case "$active_real" in
  "$target_real"|"$target_real"/*)
    block "Obsidian is using the worktree selected for removal: $target_real"
    ;;
esac

printf 'SAFE: Obsidian uses %s, not %s\n' "$active_real" "$target_real"
