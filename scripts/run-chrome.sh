#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
profile_dir="${WEBCHAT_CHROME_PROFILE:-/tmp/webchat-chrome-profile}"
extension_dir="${root_dir}/browser-extension"
start_url="${WEBCHAT_START_URL:-https://chatgpt.com/}"

mkdir -p "$profile_dir"

open -na "Google Chrome" --args \
  "--user-data-dir=${profile_dir}" \
  "--load-extension=${extension_dir}" \
  "$start_url"
