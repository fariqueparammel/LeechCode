#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
profile_dir="${WEBCHAT_ANTIGRAVITY_PROFILE:-/tmp/webchat-antigravity-profile}"
extensions_dir="${WEBCHAT_ANTIGRAVITY_EXTENSIONS:-/tmp/webchat-antigravity-extensions}"
# Derive the VSIX name from package.json so we always install the freshly-packaged build.
version="$(grep -m1 '"version"' "$root_dir/package.json" | sed -E 's/.*"version"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/')"
vsix_file="${root_dir}/webchat-${version}.vsix"
cli_bin="${WEBCHAT_ANTIGRAVITY_CLI:-/Applications/Antigravity IDE.app/Contents/Resources/app/bin/antigravity-ide}"
app_name="${WEBCHAT_ANTIGRAVITY_APP:-/Applications/Antigravity IDE.app}"

find_profile_pids() {
  ps -axo pid=,command= | awk -v pat="$profile_dir" '
    index($0, pat) && index($0, "Antigravity IDE.app") {print $1}
  '
}

if [[ ! -f "$vsix_file" ]]; then
  echo "Missing VSIX: $vsix_file"
  echo "Run: pnpm run package"
  exit 1
fi

mkdir -p "$profile_dir" "$extensions_dir"

"$cli_bin" \
  --user-data-dir "$profile_dir" \
  --extensions-dir "$extensions_dir" \
  --install-extension "$vsix_file" \
  --force

if [[ "${WEBCHAT_RESTART:-0}" == "1" ]]; then
  pids="$(find_profile_pids || true)"
  if [[ -n "$pids" ]]; then
    printf '%s\n' "$pids" | xargs kill || true
    sleep 2
  fi
fi

pids="$(find_profile_pids || true)"
if [[ -n "$pids" ]]; then
  echo "Antigravity WebChat profile is already running."
  echo "Profile: $profile_dir"
  echo "Extensions: $extensions_dir"
  echo "PIDs: $pids"
  echo "Set WEBCHAT_RESTART=1 to restart only this profile."
  exit 0
fi

open -na "$app_name" --args \
  --new-window \
  --user-data-dir "$profile_dir" \
  --extensions-dir "$extensions_dir" \
  --disable-workspace-trust \
  "$root_dir"

echo "Started Antigravity with WebChat IDE extension."
echo "Profile: $profile_dir"
echo "Extensions: $extensions_dir"
