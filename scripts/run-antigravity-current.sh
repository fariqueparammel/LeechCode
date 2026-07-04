#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# Derive the VSIX name from package.json so we always install the freshly-packaged build, not a stale one.
version="$(grep -m1 '"version"' "$root_dir/package.json" | sed -E 's/.*"version"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/')"
vsix_file="${root_dir}/webchat-${version}.vsix"
cli_bin="${WEBCHAT_ANTIGRAVITY_CLI:-/Applications/Antigravity IDE.app/Contents/Resources/app/bin/antigravity-ide}"

if [[ ! -f "$vsix_file" ]]; then
  echo "Missing VSIX: $vsix_file"
  echo "Run: pnpm run package"
  exit 1
fi

"$cli_bin" \
  --install-extension "$vsix_file" \
  --force

"$cli_bin" \
  --new-window \
  "$root_dir"

echo "Opened WebChat in the current Antigravity profile."
echo "Workspace: $root_dir"
