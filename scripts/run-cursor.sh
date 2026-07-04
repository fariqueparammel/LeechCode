#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
profile_dir="${WEBCHAT_CURSOR_PROFILE:-/tmp/webchat-cursor-profile}"
extensions_dir="${WEBCHAT_CURSOR_EXTENSIONS:-/tmp/webchat-cursor-extensions}"
# Derive the VSIX name from package.json so we always install the freshly-packaged build.
version="$(grep -m1 '"version"' "$root_dir/package.json" | sed -E 's/.*"version"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/')"
vsix_file="${root_dir}/webchat-${version}.vsix"

if [[ ! -f "$vsix_file" ]]; then
  echo "Missing VSIX: $vsix_file"
  echo "Run: pnpm run package"
  exit 1
fi

mkdir -p "$profile_dir" "$extensions_dir"
cursor \
  --user-data-dir "$profile_dir" \
  --extensions-dir "$extensions_dir" \
  --install-extension "$vsix_file" \
  --force

cursor \
  --new-window \
  --user-data-dir "$profile_dir" \
  --extensions-dir "$extensions_dir" \
  "$root_dir"
