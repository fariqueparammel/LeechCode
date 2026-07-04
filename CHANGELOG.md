# Changelog

## 0.0.17 — initial public release

First public cut of **LeechCode** — drive a real, logged-in web AI chat (ChatGPT, Claude, Gemini,
Qwen, DeepSeek, Google AI Studio) as the model behind an agentic coding loop in your editor.

- Activity-bar chat panel (React): live streaming, inline Apply/Preview/Skip diff cards, token
  counts per message, ⏹ Stop, retry, session budget meter.
- Agent tool loop: `read_file` / `list_dir` / `search` / `run` (shell) / `spawn_subagent`, with
  results fed back to the chat automatically.
- Four agent modes: Ask · Auto-edit · Plan · Bypass.
- Whole-codebase indexing (`/index`, `@codebase`) with automatic chunked delivery for large repos;
  per-provider per-message and per-conversation character windows.
- Project structure sent with every turn; before→after diffs on every applied edit.
- Composer: paste screenshots, attach files, on-page model switcher, provider feature toggles
  (e.g. DeepSeek Search / DeepThink); optional local vision model (image → text) via any
  OpenAI-compatible endpoint.
- Continue-a-chat: paste a previous conversation URL to resume it; recently used chats tracked.
- Resilience: login/upsell overlay dismissal, submit retries, never interrupts an in-flight
  generation; robust parsing of fenced/bare tool JSON across providers.
- Local-only bridge (`127.0.0.1:53451`), no telemetry.

## 0.0.1

- Initial WebChat extension scaffold.
