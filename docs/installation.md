# Installing LeechCode (step by step)

LeechCode has **two halves** that talk over a local WebSocket on `127.0.0.1:53451`:

1. an **IDE extension** (a `.vsix`) installed into any VS Code–compatible editor, and
2. a **browser extension** (Manifest V3, unpacked) loaded into a Chromium-based browser.

Neither is on a marketplace yet — you build/install both locally. It takes about five minutes.

---

## 0. Prerequisites

| Requirement | Notes |
| --- | --- |
| Node.js **20+** (22+ recommended) | 22+ runs the full test suite (built-in WebSocket); 20 is fine for building |
| pnpm **9+** | `npm install -g pnpm` (or `corepack enable`) |
| Chromium-based browser | Chrome, Brave, Edge, Chromium — Firefox is **not** supported (MV3 offscreen API) |
| A VS Code–compatible editor | VS Code, Cursor, VSCodium, Windsurf, Antigravity, … |
| An account on a chat provider | ChatGPT / Claude / Gemini / Qwen / DeepSeek / Google AI Studio (free tiers work) |

## 1. Clone and build

```bash
git clone git@github.com:fariqueparammel/LeechCode.git
# or: git clone https://github.com/fariqueparammel/LeechCode.git
cd LeechCode
pnpm install
pnpm run compile
pnpm test              # optional: run the unit suite
pnpm run package       # produces webchat-<version>.vsix in the repo root
```

## 2. Install the IDE extension

Pick your editor:

```bash
# VS Code
code --install-extension ./webchat-*.vsix

# Cursor
cursor --install-extension ./webchat-*.vsix

# VSCodium
codium --install-extension ./webchat-*.vsix
```

Editors without a CLI on your PATH: open the command palette → **Extensions: Install from VSIX…** → pick the `webchat-<version>.vsix` file.

Then **reload the window** (command palette → *Developer: Reload Window*). You should see the **LeechCode** icon in the Activity Bar; clicking it opens the chat panel.

> Updating later: rebuild (`pnpm run package`) and install the new VSIX with `--force` / the same palette command, then reload the window again.

## 3. Load the browser extension

1. In Chrome/Brave/Edge open `chrome://extensions` (Brave: `brave://extensions`).
2. Toggle **Developer mode** (top-right).
3. Click **Load unpacked**.
4. Select the `browser-extension/` folder inside the cloned repo.

The **WebChat Bridge** card appears. It immediately starts trying to connect to the IDE's bridge on `ws://127.0.0.1:53451` (and reconnects automatically every few seconds).

> Updating later: after pulling changes that touch `browser-extension/`, hit the ↻ reload icon on the extension card, then refresh any open chat tabs.

## 4. First connection

1. In the editor, open the **LeechCode** panel. The bridge starts automatically (status strip at the top).
2. In the extension-loaded browser, open your chat provider — e.g. `https://chatgpt.com/` — **or** click **open chat tab** in the panel, which launches a browser with the extension and the right URL for the selected provider.
3. Log in to the provider once. The session sticks to that browser profile.
4. Watch the status strip: the dot goes green and reads **`1 browser connected`**. A notice appears: *"Browser connected — 1 chat tab ready."*

Quick sanity check without the panel: `curl "http://127.0.0.1:53451/health"` should report `"running":true` and one browser client.

## 5. First task

1. Pick a provider in the panel's dropdown (top bar).
2. (Recommended) Open ⚙ Settings → enable **Auto-submit prompts** for the hands-off loop; otherwise LeechCode types the prompt into the page and you press the page's send button yourself.
3. Type something like *"create a factorial.py with tests"* and hit **Send**.
4. Watch the reply stream into the panel. When file changes arrive you get an inline card — **Apply** opens a before→after diff for every file it writes.
5. Try `/index` to give the chat your whole codebase, `@file` mentions for specific files, and the mode dropdown (Ask / Auto-edit / Plan / Bypass) to control how much it's allowed to do on its own.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Status strip says **Bridge offline** | Run the command **LeechCode: Start Browser Bridge**; check nothing else is on port 53451 (`lsof -i :53451`). Change `webchat.bridge.port` *and* `BRIDGE_PORT` in `browser-extension/src/offscreen.js` together if you must move it. |
| **Bridge up · no browser** | The browser extension isn't loaded/connected: reload the extension card, make sure a supported chat site tab is open, and that you didn't load the extension into a different browser than the one you're using. |
| Prompt is typed but never sent | Enable `webchat.browser.autoSubmit`, or the page changed its send-button markup — see [provider-adapters.md](provider-adapters.md). |
| Reply never streams into the panel | The page changed its reply container selectors — see [provider-adapters.md](provider-adapters.md) (`assistantSelectors`). |
| A login/upsell pop-up blocks everything | LeechCode auto-dismisses the common ones and retries; hard login walls need one manual login in that browser. |
| "message too long" style errors from the provider | Lower the per-message limit for that provider in ⚙ Settings (per-provider **Max message length**). |
| Port/token mismatch after changing settings | `bridge.port`/`bridge.token` are mirrored in `browser-extension/src/offscreen.js`; edit both, reload extension + window. |

## Uninstall

- Editor: uninstall the *LeechCode* extension from the Extensions view.
- Browser: remove the *WebChat Bridge* card from `chrome://extensions`.
- The extension stores state only in the editor's extension storage (session summaries, chat-URL history) and writes nothing outside your workspace except pre-edit diff snapshots inside the editor's extension-storage folder.
