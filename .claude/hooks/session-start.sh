#!/bin/bash
set -euo pipefail

# Only run in the Claude Code on the web remote environment.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

# Install JS dependencies (includes native addons better-sqlite3 + sharp).
# npm install is preferred over npm ci so the cached container layer is reused.
npm install

# Sync SvelteKit generated types so svelte-check/build work immediately.
npm run prepare
