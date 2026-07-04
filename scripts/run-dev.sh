#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$root_dir"

pnpm run package
"$root_dir/scripts/run-antigravity.sh"
"$root_dir/scripts/run-brave.sh"

cat <<'EOF'

WebChat dev environment is starting.

Next:
1. In Antigravity, run "WebChat: Show Browser Bridge Status".
2. In Brave, log into the target web chat if needed.
3. In Antigravity, run "WebChat: Run Agent Task".

Use WEBCHAT_RESTART=1 pnpm run dev to restart only the isolated WebChat profiles.
EOF
