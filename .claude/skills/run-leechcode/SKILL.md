---
name: run-leechcode
description: Build, run, test, drive and screenshot LeechCode (the WebChat IDE extension + browser bridge). Use when asked to run/start/launch the extension, smoke-test or drive the agent loop headlessly, screenshot the mock chat page, package/install the VSIX, or verify a change end-to-end.
---

# Run LeechCode

LeechCode is a VS Code–fork extension (host code in `src/` → `dist/`, React panel in `webview-ui/`)
plus an MV3 browser extension (`browser-extension/`), talking over a localhost WS bridge. The GUI
panel only exists inside an IDE — so the **agent path is the headless loop driver**
(`.claude/skills/run-leechcode/driver.mjs`): it runs the *real* `LocalBridgeServer`, attaches a
simulated browser+LLM over a real WebSocket, takes input through the server's real `POST /prompt`,
and asserts the round trip through the *real* response parser. All paths below are relative to the
repo root and were executed verbatim on this machine.

## Prerequisites

Node ≥ 22 (global `WebSocket`/`fetch`; the full test suite needs it) and pnpm ≥ 9.
**On this machine homebrew node is broken** (missing `libsimdjson`) — use the codex runtime in
every shell:

```bash
CODEX=/Users/Farique/.cache/codex-runtimes/codex-primary-runtime/dependencies
export PATH="$CODEX/node/bin:$CODEX/bin:$PATH"
```

## Build

```bash
pnpm install
pnpm run compile     # tsc (host) -> dist/  +  esbuild (webview) -> dist/webview/
```

## Run — agent path (headless loop driver)

One-shot smoke of the whole agent loop (bridge → prompt → streamed reply → parsed file write);
exits 0/1:

```bash
node .claude/skills/run-leechcode/driver.mjs demo
```

Interactive: keep it serving and drive it with curl (it prints every delta/done envelope; the
scripted browser also ACKs `<webchat_codebase_index part="i" of="N">` chunks, so chunked-index
flows can be driven too):

```bash
node .claude/skills/run-leechcode/driver.mjs serve
# in another shell:
curl -s -X POST 'http://127.0.0.1:53461/prompt?token=driver-token' -H 'Content-Type: application/json' \
  --data '{"providerId":"mock","chatUrl":"http://127.0.0.1:53452/","prompt":"User task:\nsay hi","promptNumber":1,"expectedAction":"submit","autoSubmit":true}'
```

Port/token via `LEECH_DRIVER_PORT` / `LEECH_DRIVER_TOKEN` (defaults 53461 / `driver-token` —
deliberately not 53451, which a running IDE owns).

Deeper end-to-end harnesses (same idea, more assertions):

```bash
pnpm run verify:tooling        # streaming mask + tool-protocol parse
pnpm run verify:chunked-index  # ordered ack-gated chunk delivery over a real bridge
```

## Direct invocation (PRs that touch internals)

`dist/` is plain CJS — import and call without any app running:

```bash
node -e "
const { parseAgentResponse } = require('./dist/agent/toolProtocol.js');
const r = parseAgentResponse('prose jsonCopyDownload{\"summary\":\"x\",\"files\":[],\"tools\":[{\"name\":\"run\",\"command\":\"ls\"}],\"nextSteps\":[]}');
console.log('parsed tools:', JSON.stringify(r.tools));
"
```

## Screenshot the chat GUI (mock provider page)

```bash
node scripts/run-mock-webchat.mjs &   # serves demo/mock-webchat on :53452
sleep 1.5
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless=new --disable-gpu --no-first-run --no-default-browser-check --disable-extensions \
  --user-data-dir=/tmp/leech-headless-profile --hide-scrollbars \
  --window-size=1280,900 --screenshot=/tmp/mock-chat.png http://127.0.0.1:53452/
pkill -f run-mock-webchat
```

⚠ Run the Chrome line from an **unsandboxed** shell (see Gotchas) and always pass an isolated
`--user-data-dir` so the user's real profile is never touched.

## Test

```bash
pnpm test    # node --test dist/test/*.test.js — 58 tests
```

## Run — human path (real IDE + real browser)

```bash
pnpm run package   # -> webchat-<version>.vsix
"/Applications/Antigravity IDE.app/Contents/Resources/app/bin/antigravity-ide" \
  --install-extension ./webchat-*.vsix --force
```

Installs into the **already-open** IDE (no new instance); reload the window to activate. Load
`browser-extension/` unpacked via `brave://extensions` (reload the card + refresh chat tabs after
changing `browser-extension/src/*`). `pnpm run dev:current` scripts the whole flow. Check the live
bridge anytime: `curl -s http://127.0.0.1:53451/health` — only run `pnpm run verify:live-bridge`
when `browserClients` is non-empty.

## Gotchas

- **Headless Chrome/Brave hang forever when spawned from a sandboxed agent shell** (no error — the
  helper processes can't spawn). Disable the command sandbox for browser launches. Brave also
  wedged with legacy `--headless` here; use **Chrome with `--headless=new`**.
- **Port 53451 is owned by the running IDE's bridge** — never bind test servers to it; the driver
  defaults to 53461.
- The driver imports from `dist/` — run `pnpm run compile` first or it dies on require.
- A timed-out shell can orphan the mock server: `pkill -f run-mock-webchat`.
- zsh aborts scripts on unmatched globs (`no matches found`) — use `find` in probes.

## Troubleshooting

- `Cannot find module '.../dist/bridge/localBridgeServer.js'` → `pnpm run compile`.
- `EADDRINUSE` from the driver → another driver instance is alive; `LEECH_DRIVER_PORT=53462 node … serve`.
- Screenshot file never appears, no error → you're in the sandboxed shell (see Gotchas).
- `pnpm test` shows fewer tests / skips WebSocket suites → Node < 22; use the codex runtime PATH.
