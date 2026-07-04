#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
profile_dir="${WEBCHAT_BRAVE_PROFILE:-/tmp/webchat-brave-profile}"
extension_dir="${root_dir}/browser-extension"
start_url="${WEBCHAT_START_URL:-https://chatgpt.com/}"

mkdir -p "$profile_dir"

brave_bin="/Applications/Brave Browser.app/Contents/MacOS/Brave Browser"
log_file="${WEBCHAT_BRAVE_LOG:-/tmp/webchat-brave.log}"

find_profile_pids() {
  ps -axo pid=,command= | awk -v pat="$profile_dir" '
    index($0, pat) && index($0, "Brave Browser.app") {print $1}
  '
}

if [[ "${WEBCHAT_RESTART:-0}" == "1" ]]; then
  pids="$(find_profile_pids || true)"
  if [[ -n "$pids" ]]; then
    printf '%s\n' "$pids" | xargs kill || true
    sleep 2
  fi
fi

pids="$(find_profile_pids || true)"
if [[ -n "$pids" ]]; then
  echo "Brave WebChat profile is already running."
  echo "Profile: $profile_dir"
  echo "PIDs: $pids"
  echo "Set WEBCHAT_RESTART=1 to restart only this profile."
  exit 0
fi

rm -f "$profile_dir/SingletonLock" "$profile_dir/SingletonSocket" "$profile_dir/SingletonCookie"

"$brave_bin" \
  "--user-data-dir=${profile_dir}" \
  "--load-extension=${extension_dir}" \
  "--no-first-run" \
  "--new-window" \
  "$start_url" \
  >"$log_file" 2>&1 &

echo "Started Brave with WebChat Bridge extension."
echo "Profile: $profile_dir"
echo "Extension: $extension_dir"
echo "Log: $log_file"
