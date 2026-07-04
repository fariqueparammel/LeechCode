# 🪱 LeechCode

**Leech onto your logged-in web AI chat — ChatGPT, Claude, Gemini, Qwen, DeepSeek, Google AI Studio — and run a full agentic coding loop inside your editor. No API keys. No metered tokens.**

LeechCode is a VS Code–compatible extension (VS Code, Cursor, VSCodium, Windsurf, Antigravity and other forks) that uses a **real browser chat session** as the model transport. Your browser already holds a logged-in chat session, so the agent loop runs for free: the IDE owns the context, tools, file edits, diffs and approvals — the browser page is just the LLM.

> **Our belief: AI should be free to use.** Powerful AI assistance shouldn't be locked behind API
> bills and metered tokens. You already have access to capable models through the chat interfaces
> you're logged into — LeechCode simply puts an agentic coding workflow on top of what you already
> have, so anyone can build with AI at no extra cost.

```
Developer
   │  task in the IDE panel
   ▼
LeechCode IDE extension ───────── owns: project context, prompt build, tools,
   │   ▲                                file edits, diffs, approvals, sessions
   │   │  ws://127.0.0.1:53451  (local bridge)
   ▼   │
LeechCode browser extension (MV3)
   │   ▲   types the prompt into the page · streams the reply back
   ▼   │
Web AI chat page (chatgpt.com / claude.ai / gemini / qwen / deepseek / aistudio)
```

## Features

- **Agentic tool loop** — the chat model can request `read_file`, `list_dir`, `search`, `run` (any shell command: git, tests, lint, format) and `spawn_subagent`; LeechCode executes them and feeds results back until the task is done.
- **File edits with real diffs** — every applied edit snapshots the pre-edit file and opens a before→after diff. Inline Apply / View diff / Skip cards.
- **Four agent modes** — `Ask` (approve edits *and* tools), `Auto-edit` (auto-apply edits, approve tools), `Plan` (read-only planning), `Bypass` (full auto).
- **Whole-codebase indexing** — `@codebase` / `/index` delivers your project to the chat; if it's too big for one message it's split into ordered, acknowledged chunks (large files split with `part k/n` markers).
- **Project awareness on every turn** — a compact `PROJECT_STRUCTURE.txt` file tree rides along with each prompt so the model always knows the repo layout and reads files before editing them.
- **Per-provider windows** — configurable per-message and per-conversation character limits for each provider.
- **Live streaming** — the model's explanation streams into the panel; the protocol JSON is hidden. Robust to providers that wrap the block in markdown fences (e.g. DeepSeek).
- **Session management** — token estimates per message, budget meter, compaction prompts, fresh-chat rotation seeded from a compacted summary, and a **Continue a chat** field: paste any previous conversation URL to resume it (recently used chats are tracked automatically).
- **Composer niceties** — paste screenshots from the clipboard, attach files, switch the provider's model from the IDE, toggle on-page features (DeepSeek **Search** / **DeepThink**), ⏹ Stop an in-flight response (the page's generation is stopped and the model is told to disregard it), one-click retry.
- **Bring-your-own vision** — optionally route pasted images through your **local** vision model (Ollama / LM Studio, any OpenAI-compatible endpoint); the image's description/OCR is injected as text, sidestepping web-chat image limits.
- **Resilience** — login/upsell/cookie overlays are auto-dismissed, blocked submits retry automatically, and chunked deliveries never interrupt an in-flight response.
- **No telemetry.** Everything runs on `127.0.0.1`.

---

## Installation

> Full step-by-step (per IDE, with troubleshooting): **[docs/installation.md](docs/installation.md)**

### Prerequisites

- **Node.js 20+** (22+ recommended — the test suite uses the built-in WebSocket client) and **pnpm 9+**
- A **Chromium-based browser**: Chrome, Brave, Edge or Chromium (the browser extension is Manifest V3; Firefox is not supported yet)
- A VS Code–compatible editor: VS Code, Cursor, VSCodium, Windsurf, Antigravity, …

### 1. Build the extension

```bash
git clone git@github.com:fariqueparammel/LeechCode.git
cd LeechCode
pnpm install
pnpm run compile     # typecheck + bundle
pnpm run package     # -> webchat-<version>.vsix
```

### 2. Install the VSIX into your editor

```bash
code --install-extension ./webchat-*.vsix      # VS Code
cursor --install-extension ./webchat-*.vsix    # Cursor
```

Any fork works via its CLI or **Extensions: Install from VSIX…** in the command palette. Reload the window afterwards — a **LeechCode** icon appears in the Activity Bar.

### 3. Load the browser extension

1. Open `chrome://extensions` (or `brave://extensions`).
2. Enable **Developer mode**.
3. Click **Load unpacked** and select this repo's [`browser-extension/`](browser-extension/) folder.

### 4. Connect and go

1. In the editor, open the **LeechCode** panel. The status strip shows the bridge state.
2. Click **open chat tab** (or just open chatgpt.com / claude.ai / … in the browser that has the extension). The extension connects to the local bridge at `ws://127.0.0.1:53451` automatically — the dot turns green: `1 browser connected`.
3. Log into the chat provider once in that browser (your session persists).
4. Type a task in the panel and hit **Send**. For the fully hands-off loop, enable `webchat.browser.autoSubmit` in Settings (⚙ in the panel).

---

## Using LeechCode

| In the composer | What it does |
| --- | --- |
| `@somefile` | attach specific workspace files as context |
| `@codebase` or `/index` | index the whole workspace (chunked automatically if too large) |
| `/ask` `/auto` `/plan` | switch agent mode |
| `/compact` `/clear` `/open` `/close` | compact session · reset · open/close the chat browser |
| paste a screenshot / `＋` | attach images & files (optionally analyzed by your local vision model) |
| `model…` dropdown | switch the model on the provider page |
| 🔍 / 🧠 pills | toggle provider features (e.g. DeepSeek Search / DeepThink) |
| 🔗 Continue a chat | paste a previous conversation URL to resume it |

**Agent modes**

| Mode | File edits | Tools / shell commands |
| --- | --- | --- |
| Ask | review diff, then apply | approve each batch |
| Auto-edit | applied automatically | approve each batch |
| Plan | none | read-only exploration only |
| Bypass | applied automatically | run automatically |

**Key settings** (all under the `webchat.*` namespace, editable in the in-panel ⚙ Settings or VS Code settings): `defaultProvider`, `agent.mode`, `browser.autoSubmit`, `provider.maxMessageChars` / `provider.maxSessionChars` (per-provider windows), `index.chunked` / `index.maxChunks`, `context.maxIndexChars` / `context.maxTreeChars`, `diff.showOnApply`, `vision.*` (local image→text), `session.*` (budget / compaction / rotation), `bridge.port` / `bridge.token`.

> ⚠️ `bridge.port` (53451) and `bridge.token` are mirrored in `browser-extension/src/offscreen.js` — change both sides together.

## When a provider changes its page

Chat sites update their HTML often. Everything page-specific lives in **one file** — `browser-extension/src/content.js` — and **[docs/provider-adapters.md](docs/provider-adapters.md)** explains exactly which selector list to edit for each symptom (input not found, won't submit, no streaming, pop-up not dismissed, Stop, model switch), how to find a stable selector in DevTools in ~2 minutes, and how to reload. You can fix a provider yourself without waiting for a LeechCode update.

## Development

```bash
pnpm run compile             # tsc (extension host) + esbuild (webview React app)
pnpm test                    # node --test unit suite
pnpm run verify:tooling      # streaming + tool-protocol end-to-end (headless)
pnpm run verify:chunked-index# chunked indexing over a real bridge (headless)
pnpm run package             # build the VSIX
```

Repo map: `src/` (extension host: bridge, agent protocol & tools, prompt builders, controller, webview host) · `webview-ui/` (React chat panel) · `browser-extension/` (MV3 page bridge) · `scripts/` (dev launchers & verification harnesses) · `docs/` (architecture, provider adapters, installation). The dev launcher scripts (`pnpm run dev*`) are tuned for the author's machine (Antigravity + Brave paths) — the manual steps above work anywhere.

Architecture deep-dive: [docs/architecture.md](docs/architecture.md).

## Fair use

LeechCode automates *your own* logged-in browser session. Automating a chat UI may be against some providers' terms of service — use your own account, keep volumes reasonable, and use it responsibly. This project ships no telemetry and never sends your code anywhere except to the chat page you point it at.

## License

[MIT](LICENSE)
