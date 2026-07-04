# WebChat Bridge Browser Extension

This browser extension is the bridge between real web AI chat pages and the WebChat IDE extension.

Current bridge:

- Detects supported provider pages.
- Keeps the localhost WebSocket alive from a Manifest V3 offscreen document.
- Uses the background service worker as a router between the offscreen bridge and provider tabs.
- Inserts prompts into supported web chat inputs.
- Optionally submits prompts when `autoSubmit` is set by the IDE bridge payload.
- Streams response deltas and sends `chat.stream.done` when the visible assistant response stabilizes.
- Uses provider-specific selectors for ChatGPT, Claude, Gemini, Qwen, and the local mock page.
- Supports the local mock provider at `http://127.0.0.1:53452/` for deterministic testing.

Next steps:

- Add login-required, rate-limit, and chat-limit state detection.
- Add provider-specific new-chat controls for cleaner rotation.

## Launch Automatically

From the repo root:

```bash
pnpm run dev:browser
```

That launches Brave with this folder loaded through Chromium's `--load-extension` flag. `pnpm run dev` launches both Antigravity and Brave.

## Load Manually in Chrome/Chromium

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click `Load unpacked`.
4. Select this `browser-extension` folder.
