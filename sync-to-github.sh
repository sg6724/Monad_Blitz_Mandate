#!/usr/bin/env bash
# One-way: pushes Jainam's local Claude chats + memory + brainstorm notes to the
# `jainam-chats` branch of the Mandate repo every INTERVAL seconds.
# Never pulls. Teammate's work on main is never read or touched. Ctrl+C to stop.
set -u
INTERVAL="${INTERVAL:-15}"
REPO_URL="https://github.com/sg6724/Monad_Blitz_Mandate"
BRANCH="jainam-chats"
CLONE="${CLONE:-$HOME/.cache/mandate-sync}"
PROJ="$HOME/Downloads/Temp/Monad-Blitz-v3-2026"
CLAUDE_DIR="$HOME/.claude/projects/-Users-jainam-oswal-Downloads-Temp-Monad-Blitz-v3-2026"

[ -d "$CLONE/.git" ] || git clone "$REPO_URL" "$CLONE" || exit 1
cd "$CLONE" || exit 1
git checkout -q -B "$BRANCH" origin/main 2>/dev/null || git checkout -q -B "$BRANCH"
mkdir -p chats docs/claude-memory docs/brainstorm

while true; do
  cp "$CLAUDE_DIR"/*.jsonl chats/ 2>/dev/null          # raw chat transcripts
  rsync -a --delete "$CLAUDE_DIR/memory/" docs/claude-memory/
  [ -f "$PROJ/temp.txt" ] && cp "$PROJ/temp.txt" docs/brainstorm/brainstorm-session.txt
  git add chats docs/claude-memory docs/brainstorm
  if ! git diff --cached --quiet; then
    if git commit -qm "sync: $(date '+%H:%M:%S')" && git push -q --force origin "$BRANCH"; then
      echo "$(date '+%H:%M:%S') pushed"
    else
      echo "$(date '+%H:%M:%S') push failed"
    fi
  fi
  sleep "$INTERVAL"
done
