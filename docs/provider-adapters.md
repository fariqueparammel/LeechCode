# Editing provider adapters (fix a chat site yourself)

> **Easiest way — no code: the in-panel GUI.** LeechCode Settings → **Page adapter** lets you paste
> new CSS selectors for the three universal roles (chat input box · send button · reply container),
> **Save & apply** them live to the browser, and hit **Test on live page** to see exactly which
> selector matched each role on the open tab. Overrides are stored per website (in the browser
> extension's local storage, pushed automatically on every reconnect) and are tried *before* the
> built-ins below. Everything after this note is the under-the-hood/manual route — useful for deep
> changes like adding a brand-new provider.

Web AI chat pages (ChatGPT, Claude, Gemini, Qwen, DeepSeek, AI Studio) change their HTML often.
When that happens, LeechCode may fail to **find the input**, **click Send**, **read the response**,
**dismiss a login pop‑up**, **click Stop**, or **switch the model**. You can fix this yourself by
editing **one file** — no LeechCode update required:

```
browser-extension/src/content.js
```

Everything page‑specific lives there. After editing, [reload the extension](#reload-after-editing).
Nothing here needs a rebuild of the IDE extension.

---

## The one thing to edit: the `providers` array

Near the top of `content.js` is a `providers` array. Each entry is one chat site:

```js
{
  id: "chatgpt",                 // internal id (leave as-is)
  label: "ChatGPT",
  hosts: ["chatgpt.com"],        // which hostnames this adapter runs on
  inputSelectors:  [ /* where you type */ ],
  submitSelectors: [ /* the Send button */ ],
  assistantSelectors: [ /* the assistant's reply text */ ]
}
```

Selectors are tried **in order**; the first visible match wins. If one breaks, add the new correct
selector **at the top** of the relevant list (keep the old ones as fallbacks). There are also shared
fallback lists (`FALLBACK_INPUT_SELECTORS`, `FALLBACK_SUBMIT_SELECTORS`, `FALLBACK_ASSISTANT_SELECTORS`)
used for every provider, plus global lists for **Stop** (`STOP_SELECTORS`), **model switching**
(`MODEL_OPENER_SELECTORS`), and pop‑up **dismissal** (`DISMISS_BUTTON_TEXTS` / `NON_DISMISS_ACTION_TEXTS`).

---

## How to find a selector (2 minutes in DevTools)

1. Open the chat site in the browser that has the **WebChat Bridge** extension loaded.
2. Right‑click the element (the input box, the Send button, a reply) → **Inspect**.
3. In the Elements panel, look for a **stable** attribute on the highlighted node, preferring in this
   order: `data-testid` → `aria-label` → `id` → a semantic tag (`textarea`, `button`, `article`).
   Avoid hashed/random class names (e.g. `.css-1a2b3c`) — those change on every deploy.
4. Write a CSS selector for it and verify in the DevTools **Console**:
   ```js
   document.querySelectorAll("YOUR_SELECTOR")   // should return exactly the element(s) you want
   ```
5. Put that selector at the top of the matching list in `content.js`.

**Which list?**

| Symptom in LeechCode | Edit this list |
| --- | --- |
| "Could not find the chat input" | `inputSelectors` (that provider) |
| "no enabled chat submit control" / never submits | `submitSelectors` |
| Response never streams / stuck on "thinking" | `assistantSelectors` (this is the reply container) |
| A login/upsell/cookie pop‑up isn't dismissed | `DISMISS_BUTTON_TEXTS` (add the button's text, lowercased) |
| It clicks "Log in" by mistake | `NON_DISMISS_ACTION_TEXTS` (add that text so it's never clicked) |
| ⏹ Stop doesn't halt generation | `STOP_SELECTORS` |
| Model switch can't open the picker | `MODEL_OPENER_SELECTORS`, and provider `models` list in `src/providers/registry.ts` |

### Tips
- The **assistant** selector should match the *container of the latest reply* — LeechCode reads the
  `.textContent` of the **last** visible match and streams the delta. If it matches too much (e.g. the
  whole page) or too little (an empty wrapper), streaming breaks.
- The **input** may be a `<textarea>` **or** a `contenteditable` div (ProseMirror, Quill `.ql-editor`).
  Both are supported; just point the selector at the editable element.
- Submit matching also checks the button's text/aria for "send"/"submit" — a generic `button` selector
  is fine as a fallback.

---

## Login walls & rate limits

LeechCode auto‑dismisses soft overlays (it clicks buttons/links whose text is in
`DISMISS_BUTTON_TEXTS`, e.g. `"stay logged out"`, `"reject all"`, `"skip"`), and it **retries the
submit** a couple of times before reporting "blocked". If a provider shows a *new* dismiss control:

- Add its **exact lowercased text** to `DISMISS_BUTTON_TEXTS` (e.g. `"continue for now"`).
- If LeechCode is wrongly clicking a sign‑in/upgrade button, add that text to `NON_DISMISS_ACTION_TEXTS`.

A hard login wall (no chat without an account — Gemini sometimes) can't be skipped; log in once in the
browser and the session persists.

---

## Reload after editing

1. Save `content.js`.
2. Browser → `chrome://extensions` (or `brave://extensions`) → **reload** the *WebChat Bridge* card.
3. **Refresh the chat tab** so the new content script loads.

That's it — no IDE reload needed for content‑script changes. (If you change `background.js` or
`offscreen.js`, still just reload the extension card + refresh the tab.)

---

## Current selectors (quick reference, may drift)

| Provider | input | submit | assistant |
| --- | --- | --- | --- |
| ChatGPT | `#prompt-textarea`, `[data-testid='prompt-textarea']`, `.ProseMirror` | `[data-testid='send-button']`, `button[aria-label*='Send']` | `[data-message-author-role='assistant']`, `.markdown` |
| Claude | `[contenteditable='true'][role='textbox']`, `.ProseMirror` | `button[aria-label*='Send']` | `.font-claude-message`, `[data-is-streaming]` |
| Gemini | `rich-textarea .ql-editor[contenteditable='true']` | `button[aria-label*='Send']`, `button.send-button` | `message-content .markdown`, `.model-response-text` |
| Qwen | `textarea#chat-input`, `.chat-input textarea` | `button[aria-label*='Send']`, `button[class*='send']` | `.markdown-body`, `[class*='messageContent']` |
| DeepSeek | `#chat-input`, `textarea` | `button[aria-label*='Send']` | `.ds-markdown`, `[class*='message-content']` |
| Google AI Studio | `ms-autosize-textarea textarea` | `run-button button`, `button[aria-label*='Run']` | `ms-chat-turn[data-turn-role='Model'] ms-cmark-node` |

Add a brand‑new provider by copying an entry, setting `id`/`label`/`hosts`, filling the three selector
lists, and adding the host to `manifest.json` (`host_permissions` + `content_scripts.matches`) and to
`background.js` `PROVIDER_URL_PATTERNS`, plus a registry entry in `src/providers/registry.ts`.
