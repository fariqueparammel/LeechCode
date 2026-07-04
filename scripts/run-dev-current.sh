#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$root_dir"

pnpm run package
"$root_dir/scripts/run-antigravity-current.sh"
"$root_dir/scripts/run-brave.sh"

cat <<'EOF'

WebChat current-profile dev environment is starting.

Next:
1. In the new Antigravity window, run "WebChat: Show Browser Bridge Status".
2. In Brave, log into the target web chat if needed.
3. In Antigravity, run "WebChat: Run Agent Task".

This uses your existing Antigravity profile, not a fresh isolated profile.
EOF
