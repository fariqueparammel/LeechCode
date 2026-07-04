# WebChat — Project Index

> An IDE extension (VS Code / Cursor / Antigravity / VSCodium / Windsurf forks) that uses a **real
> browser AI chat session** (ChatGPT, Claude, Gemini, Qwen, …) as the *model transport* for an
> agentic coding workflow. The browser already holds the user's logged-in session, so the agent loop
> runs for **free** — no API keys, no metered tokens. The IDE owns tools, edits, approvals, and
> session memory; the browser page is just the LLM.

Reference product this is modeled on: `robertpiosik/CodeWebChat`
(see [docs/reference-analysis.md](docs/reference-analysis.md)). We use it as architecture/product
reference only — do **not** copy its source.

---

## Big picture / data flow

```
Developer
   │  (task in IDE)
   ▼
IDE extension (this repo, src/, runs in extension host) ──── owns: context, prompt build, tools,
   │   ▲                                                            file edits, approvals, session policy
   │   │ ws://127.0.0.1:53451  (LocalBridgeServer, src/bridge/)
   ▼   │
Browser extension (browser-extension/, MV3)
   │   ▲   background.js (router) ── offscreen.js (persistent WS client) ── content.js (page adapter)
   ▼   │
Web AI chat page (chatgpt.com / claude.ai / gemini / qwen / mock)
```

One agent turn:
1. IDE collects editor context → builds an XML prompt + agent tool instructions.
2. IDE pushes a `chat.prompt` envelope over the local WebSocket bridge to the browser.
3. `background.js` routes it to the right provider tab (opening one if needed); `content.js` fills the
   page input, optionally auto-submits, dismisses login/upsell overlays.
4. `content.js` observes the assistant's streamed DOM text and streams `chat.stream.delta` /
   `chat.stream.done` back through `offscreen.js` → bridge → IDE.
5. IDE parses the assistant's marked JSON block (`<webchat_agent_response>…`), then applies file
   changes (ask / auto / never), stores the `summary`, and updates token-budget bookkeeping.
6. Session policy decides the next action: `continue`, `compact` (every N prompts), or `rotate`
   (open a fresh chat seeded from the latest compacted summary when the budget runs low).

The browser extension **never** runs tools or touches files — it is purely a page bridge. All
workspace mutation lives in the IDE extension behind path-safety checks and approval gates.

---

## Repository map

### IDE extension — `src/` (TypeScript, compiled to `dist/`, entry `dist/extension.js`)

| File | Role |
| --- | --- |
| [src/extension.ts](src/extension.ts) | Thin activation layer: instantiates the controller, registers the webview panel, registers all `webchat.*` commands (delegating to the controller; legacy palette/modal flow kept as fallback). |
| [src/webchat/controller.ts](src/webchat/controller.ts) | **The orchestrator.** Single owner of bridge lifecycle, session/budget bookkeeping, prompt dispatch, assistant-response parse, file apply/preview, malformed-response auto-repair. Exposes typed `vscode.EventEmitter` events (`onStatus`/`onStreamDelta`/`onStreamDone`/`onAssistantParsed`/`onUsage`/`onNotice`…) that the panel subscribes to. Reuses `bridge/`, `agent/`, `prompt/`, `session/`, `providers/`, `workspace/` unchanged. |
| [src/webview/panelProvider.ts](src/webview/panelProvider.ts) | `WebviewViewProvider` for view `webchat.chatView`. Builds the CSP+nonce HTML shell (loads `dist/webview/main.js` + `main.css`), mirrors controller events → `postMessage`, routes inbound webview messages → controller. |
| [src/webview/messages.ts](src/webview/messages.ts) | Shared `HostToWebview` / `WebviewToHost` discriminated-union message contract (imported by both the host and the React app). |
| [src/bridge/localBridgeServer.ts](src/bridge/localBridgeServer.ts) | Localhost HTTP + WebSocket server (hand-rolled, no `ws` dep). Token-gated `POST /prompt`, `GET /health`, WS upgrade + pairing, client ping/prune, pending-message queue when no client is connected. |
| [src/bridge/protocol.ts](src/bridge/protocol.ts) | Envelope shape + message-type union + payload interfaces (`chat.prompt`, `chat.stream.delta/done`, `chat.state`, `pair.*`). `createEnvelope()`. |
| [src/bridge/webSocketCodec.ts](src/bridge/webSocketCodec.ts) | RFC6455 frame encode/decode (text/ping/pong/close, masking both directions, length variants). No external deps. |
| [src/agent/toolProtocol.ts](src/agent/toolProtocol.ts) | The agent "tool" contract. Builds the instruction block (requires **streamed prose before the JSON block**, advertises the tool suite), parses the `<webchat_agent_response>` marked JSON (base64 file writes preferred; `tools` array of `read_file`/`list_dir`/`search`/`run`/`spawn_subagent`, legacy `commands` folded into `run`), builds the repair prompt. |
| [src/agent/tools.ts](src/agent/tools.ts) | Executes the read-only tools (`read_file`/`list_dir`/`search`) safely — workspace-scoped via `resolveWorkspacePath`, size/entry/match-capped. `run` (shell) + `spawn_subagent` live in the controller. |
| [src/prompt/buildPrompt.ts](src/prompt/buildPrompt.ts) | Provider-neutral `<webchat_request>` XML prompt (CDATA-wrapped file blocks, escaped meta). Exports `wrapCdata`/`escapeXml` for reuse by the chunker. |
| [src/prompt/indexChunker.ts](src/prompt/indexChunker.ts) | Pure `planIndexChunks()` — splits a whole-codebase index into ordered, paste-safe `<webchat_codebase_index part="i" of="N">` messages under the provider's per-message char limit; large files split across messages with `part="k/n"` continuation markers; honors a session (conversation) char cap + a max-chunk cap. `splitContent` (lossless), `buildIndexPrimedNote`. |
| [src/prompt/compaction.ts](src/prompt/compaction.ts) | `<webchat_compaction_request>` prompt — asks the model for durable state (objective, status, decisions, files, constraints, next actions, known errors). |
| [src/prompt/types.ts](src/prompt/types.ts) | `PromptFile`, `BuildPromptInput`. |
| [src/session/policy.ts](src/session/policy.ts) | Token estimate (`chars/4`), budget model, `decideNextSessionAction` (rotate if budget low → compact every Nth prompt → else continue), usage accumulators. |
| [src/providers/registry.ts](src/providers/registry.ts) · [types.ts](src/providers/types.ts) | IDE-side provider list (id, label, host, chatUrl, `maxMessageChars`, `maxSessionChars`) for chatgpt/claude/gemini/qwen/deepseek/aistudio/mock. |
| [src/workspace/context.ts](src/workspace/context.ts) | Collects active-editor (or selection-only) context as `PromptFile[]`. **Currently single active file only.** |
| [src/workspace/applyAgentChanges.ts](src/workspace/applyAgentChanges.ts) | Writes/deletes files via `vscode.workspace.fs`. `resolveWorkspacePath` rejects absolute paths & `../` traversal. |
| [src/workspace/previewAgentChanges.ts](src/workspace/previewAgentChanges.ts) | Opens `vscode.diff` previews (against empty for new files), capped at 8. |
| `src/test/*.test.ts` | `node --test` unit tests for codec, bridge server, session policy, prompt, agent protocol, index chunker, stream-text, index-turn gate, tool protocol (46 tests). |

### Webview UI — `webview-ui/` (React, bundled by esbuild → `dist/webview/`)

The Activity-Bar **WebChat** panel — a clean, Claude-Code-style chat GUI (replaces the old
command-palette + modal flow). Vanilla React, no router, themed entirely with `--vscode-*` tokens so
it matches every fork/theme. Bundled by [scripts/build-webview.mjs](scripts/build-webview.mjs)
(esbuild, `define` sets `process.env.NODE_ENV`).

| File | Role |
| --- | --- |
| [webview-ui/index.tsx](webview-ui/index.tsx) | React mount + `styles.css`. |
| [webview-ui/App.tsx](webview-ui/App.tsx) | State + `useReducer` over `HostToWebview` messages; top bar (provider `<select>`, ⟳ reset, ⚙ settings); switches Chat ↔ Settings. |
| [webview-ui/Chat.tsx](webview-ui/Chat.tsx) | `StatusStrip` (bridge dot + token meter + compact/new-chat actions), `MessageList`/`MessageItem` (live streaming), `FileChangeCard` (inline **Apply/Preview/Skip** — replaces the modal), `Composer` (textarea + context chip + Send). |
| [webview-ui/Settings.tsx](webview-ui/Settings.tsx) | Grouped in-panel settings: Provider · Context window & budget · Agent · Bridge. Each field writes via an `updateSetting` message → `webchat.*` config. |
| [webview-ui/vscodeApi.ts](webview-ui/vscodeApi.ts) | `acquireVsCodeApi` wrapper: typed `post()` / `onHostMessage()` / `uuid()`. |
| [webview-ui/styles.css](webview-ui/styles.css) | Theme-token CSS. |

### Browser extension — `browser-extension/` (Manifest V3)

| File | Role |
| --- | --- |
| [browser-extension/manifest.json](browser-extension/manifest.json) | MV3: `storage tabs alarms offscreen` perms; host perms + content-script matches for chatgpt/claude/gemini/qwen + localhost. |
| [browser-extension/src/background.js](browser-extension/src/background.js) | Service worker: keeps the offscreen doc + bridge alive (alarm every 15s), routes `chat.prompt` to a provider tab (creates one and replays the prompt on load if none), forwards content-script state/stream/done to the bridge. |
| [browser-extension/src/offscreen.js](browser-extension/src/offscreen.js) | Persistent `WebSocket` client to `ws://127.0.0.1:53451` (MV3 SWs can't hold sockets). Pair handshake, heartbeat, reconnect, pending-envelope flush. |
| [browser-extension/src/content.js](browser-extension/src/content.js) | Per-page provider **adapter**: per-provider input/submit/assistant CSS selectors (+ fallbacks), set input text (textarea & contenteditable/ProseMirror), submit (button→form→Enter), dismiss login/upsell overlays, MutationObserver+poll to stream assistant text, infer `done` after quiescence, emit lifecycle states. **This is the most provider-fragile file.** |
| `browser-extension/offscreen.html` | Host page for `offscreen.js`. |

### Scripts — `scripts/` (local dev launchers; nothing publishes to a marketplace)

`run-dev.sh` (isolated profile + Brave), `run-dev-current.sh` (your real Antigravity profile),
`run-antigravity*.sh`, `run-cursor.sh`, `run-brave.sh`, `run-chrome.sh` (load unpacked extension via
`--load-extension`), `run-mock-webchat.mjs` (deterministic local mock chat on :53452 serving
`demo/mock-webchat/`), `clean.mjs`. See [README.md](README.md) for the matching `pnpm run …` names.

### Demos — `demo/`

`mock-webchat/` (fake provider page that returns a valid agent-response block),
`tiny-notes/` (first bridge demo file), `generated-web-app/` + `chatgpt-generated-web-app/`
(outputs produced by prior agent runs). `portfolio/` is produced by the verification harness below.

---

## Key contracts

**Bridge envelope** (`src/bridge/protocol.ts`):
`{ version:1, id, sessionId, type, createdAt, payload }`. Types: `pair.request|accepted`,
`bridge.status`, `chat.open|prompt|stream.delta|stream.done|state|error`. `chat.prompt` payload
carries optional `chunkIndex`/`chunkTotal` for chunked-index delivery (informational; the browser
just types+submits the `prompt`).

**Agent response** the model must emit — 1–4 sentences of plain-language prose (which streams live to
the panel) **followed by** the marked block (parsed by `parseAgentResponse`):
```
<webchat_agent_response>
{ "summary": "...", "files": [ {"path":"rel/path","action":"write","contentBase64":"…"} ],
  "tools": [ {"name":"read_file","path":"src/x.ts"}, {"name":"run","command":"npm test"},
             {"name":"search","query":"TODO"}, {"name":"spawn_subagent","task":"…","context":["src/x.ts"]} ],
  "nextSteps": ["…"] }
</webchat_agent_response>
```
`contentBase64` (UTF-8) is preferred over raw `content`. `action` is `write` | `delete`. Paths must be
workspace-relative; absolute / `../` are rejected. **Tools** run in a capped loop (`MAX_TOOL_ITERATIONS`),
their output fed back as the next prompt: read-only tools (`read_file`/`list_dir`/`search`, executed by
`agent/tools.ts`) always run; `run` (any shell command — git/tests/lint/format) is approved per agent
mode; `spawn_subagent` delegates a focused isolated turn (only the listed context, depth-capped at 1,
`MAX_SUBAGENTS` per user task). Legacy `commands: []` still works (folded into `run` tools). Applying an
edit snapshots the pre-edit content and opens a before→after diff (`webchat.diff.showOnApply`).

**Session policy** defaults (`src/session/policy.ts`, overridable via `webchat.session.*` settings):
`maxContextTokens 150000`, `maxInputTokens 120000`, `maxOutputTokens 30000`,
`compactEveryPrompts 5`, `rotateWhenBudgetRemainingBelow 0.15`. Tokens are a `chars/4` estimate.

---

## Commands & settings

Commands (all `category: WebChat`): `startBridge`, `showBridgeStatus`, `openProvider`,
`sendPromptToBrowser`, `runAgentTask`, `copyPrompt`, `copyContext`, `showSessionStatus`,
`configureSessionBudget`, `resetSession`, `compactSessionNow`, `rotateSessionNow`.

Settings namespace `webchat.*`: `defaultProvider`, `prompt.includeSelectionOnly`, `bridge.port`,
`bridge.token`, `browser.autoSubmit`, `agent.mode`, `agent.applyMode` (ask/auto/never),
`agent.autoRepairInvalidResponses`, `agent.maxRepairAttempts`, `diff.showOnApply`, the `session.*`
budget knobs, `context.maxIndexChars` (single-message paste budget), `provider.maxMessageChars` +
`provider.maxSessionChars` (per-provider override maps for the per-message and per-conversation char
windows), and `index.chunked` / `index.maxChunks` (chunked whole-codebase indexing).
⚠ `bridge.port` (53451) and `bridge.token` ("webchat-dev-token") are **hard-coded** in
`browser-extension/src/offscreen.js` — change both sides together.

---

## Build / test / run

Toolchain note: **homebrew `node` on this machine is broken** (missing `libsimdjson`). Use the codex
runtime node (v24) + pnpm (11.x):
```bash
CODEX=/Users/Farique/.cache/codex-runtimes/codex-primary-runtime/dependencies
export PATH="$CODEX/node/bin:$CODEX/bin:$PATH"
pnpm install       # devDeps now include esbuild + react/react-dom (bundled into webview, not shipped loose)
pnpm run compile   # tsc (host) -> dist/  AND  esbuild (webview) -> dist/webview/main.js + main.css
pnpm run build:webview   # webview bundle only;  pnpm run watch:webview for an esbuild watch
pnpm test          # node --test dist/test/*.test.js  (46 tests; pretest = tsc only)
pnpm run package    # -> webchat-0.0.1.vsix (includes dist/ + media/icon.svg)
pnpm run dev:current # build+install VSIX into Antigravity + launch Brave w/ unpacked ext
```
Headless smoke without a browser: `pnpm run run:mock-chat` + `curl POST /prompt?token=…`. A fully
headless end-to-end (real bridge + real parser, simulated browser/LLM) lives in
`scripts/verify-portfolio.mjs` → writes `demo/portfolio/`. Chunked indexing has its own harnesses:
`pnpm run verify:chunked-index` (real bridge server + real chunker + simulated ack-gated browser,
asserts ordering/limits/splitting) and `pnpm run verify:live-bridge` (delivers one real framed chunk
to the already-connected browser, insert-only).

---

## Current state vs. target (gap analysis)

**Working today:** Activity-Bar React chat panel (provider switcher, live stream, inline
Apply/Preview/Skip cards, token-budget meter, grouped in-panel settings incl. the customizable
context window) · local bridge (HTTP+WS, hand-rolled, tested) · provider adapters for
chatgpt/claude/gemini/qwen + mock · prompt build + agent tool protocol + base64 file writes ·
apply modes + diff preview + malformed-response auto-repair · session budget / compact / rotate
*policy* · VSIX packaging · 46 green unit tests.

**Recently added:** agent modes (ask/auto/plan, which rewrite the model instructions) · `@`-mention
file picker + `@codebase`/`/index` **whole-workspace indexing** (tree + files under the input budget) ·
`/` **slash commands** (index/ask/auto/plan/compact/clear/open) · **command execution + tool loop**
(model returns `commands` → IDE runs them with approval → output fed back, capped) · DeepSeek +
Google AI Studio providers + auto-open-on-switch · live connect/disconnect status · **chunked
codebase indexing** — when `@codebase`/`/index` overflows one message, the index is split into
ordered `<webchat_codebase_index>` messages (large files split with `part="k/n"`) delivered one at a
time, each gated on the chat's ack, before the real task is sent (`src/prompt/indexChunker.ts` +
`controller.deliverCodebaseIndex`) · **per-provider per-message + per-conversation char windows**
(`provider.maxMessageChars` / `provider.maxSessionChars`, editable in Settings).

**Not built yet (vs. the stated vision):**
- **Context engine still file-granular** — `@`-files, `@codebase`, active editor/selection. No git
  diff, diagnostics, references, search, or symbol-level (`@function`) context yet.
- **Tools:** file write/delete + structured `read_file`/`list_dir`/`search` + shell `run`
  (git/tests/lint/format) + `spawn_subagent` (sequential, single-tab, depth-capped). Still pending:
  image paste, provider auto-fallback, and *parallel/multi-tab* subagents (current subagents run
  sequentially in the same chat).
- **Compaction/rotation is policy + prompt scaffolding**, not a closed loop: rotate seeds a new chat
  from the stored summary, but there's no automatic multi-turn drive or verification that the new
  chat continued correctly.
- Token accounting is a rough `chars/4` heuristic, not provider-aware.

When extending: keep all page/DOM logic inside `content.js` provider adapters; keep all workspace
access + approvals inside the IDE extension; treat assistant output as untrusted until parsed and
approved; keep the VS Code API surface conservative for fork compatibility; no telemetry.
