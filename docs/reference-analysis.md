# CodeWebChat Reference Analysis

Reference: `robertpiosik/CodeWebChat`

WebChat should learn from CodeWebChat's proven shape, but our product target is different. CodeWebChat connects VS Code to free chatbots with context selection, XML prompts, browser autofill, API options, and response application. Our WebChat project uses the same broad insight, but moves the center of gravity toward an agentic coding loop where the IDE extension owns tools and the web chat page acts as the model transport.

## What CodeWebChat Gets Right

- **Separate editor and browser apps.** It has an editor extension and a browser extension, plus shared types. We should keep this separation.
- **Local bridge.** It uses local WebSockets on a fixed port to connect the browser extension and editor extension. We should use the same class of local-only bridge, but add stronger pairing and session identity.
- **Provider adapters.** The browser extension has per-chatbot content scripts for providers such as ChatGPT, Claude, Gemini, Qwen, AI Studio, DeepSeek, OpenRouter, and others. We should use provider-specific adapters, not one fragile universal selector set.
- **XML prompt discipline.** Prompts are structured around files, system instructions, and user instructions. We should keep structured prompts, then extend them for tool calls, tool results, compaction, and chat rotation.
- **Context workflows.** It supports current editor context, selected workspace files, open editors, import/reference helpers, search, and relevant-file discovery. We should build context selection as a first-class workflow.
- **Apply/review workflow.** It previews AI output and applies edits through editor-side logic. We should keep edits local, reviewed, reversible, and independent of browser page scripts.
- **No telemetry stance.** The reference explicitly avoids telemetry. We should do the same.

## Where WebChat Goes Further

- **Agentic tool loop.** CodeWebChat mostly sends prompts and applies responses. WebChat should parse model-requested actions and run IDE tools: read files, search, inspect diagnostics, apply patches, run tests, and summarize results.
- **Streaming back to IDE.** The browser extension should stream assistant output into the IDE chat panel, not only help with autofill or copy/apply.
- **Session lifecycle.** WebChat should track prompt count, approximate token usage, chat exhaustion, compaction, and fresh-chat seeding.
- **Provider session manager.** Instead of treating each send as a standalone prompt, WebChat should understand a provider session as a stateful transport with readiness, streaming, blocked, login-required, and limit-hit states.
- **Tool safety model.** The IDE extension should own approval policy, workspace mutations, terminal commands, and secret redaction.
- **Provider-neutral agent protocol.** Browser adapters only handle page mechanics. The IDE agent loop remains provider-independent.
- **Fork-first editor support.** We should keep the VS Code API surface conservative so the extension works in Cursor, VSCodium, Windsurf, Antigravity-style forks, and stock VS Code.

## Feature Pillars

### 1. Context Engine

- Workspace tree context selection.
- Open editors context.
- Active selection and range context.
- Git diff context.
- Diagnostics context.
- Imports/references context.
- Search-based context.
- Relevant-file discovery.
- Token estimation and context shrinking.

### 2. Browser Bridge

- Local WebSocket server from the IDE extension.
- Browser extension reconnect and health checks.
- Pairing secret per IDE workspace.
- Connected browser list.
- Provider tab/session registry.
- Prompt submit, response stream, completion, blocked, and limit events.

### 3. Provider Adapters

- ChatGPT.
- Claude.
- Gemini.
- Qwen.
- Later: AI Studio, DeepSeek, Copilot, Grok, HuggingChat, Kimi, Mistral, OpenRouter, Open WebUI.

Each adapter needs:

- URL patterns.
- Login/readiness detection.
- New-chat behavior.
- Input detection.
- Submit behavior.
- Streaming response extraction.
- Completion detection.
- Limit/rate/block detection.

### 4. Agent Runtime

- User request intake.
- Prompt assembly.
- Tool-call parser.
- Tool executor.
- Approval gates.
- Tool-result prompt generation.
- Response renderer.
- Patch/edit preview.
- Test/terminal result loop.
- Completion detection.

### 5. Session Memory

- Prompt count.
- Approximate input/output token usage.
- Compaction after every `N` prompts.
- Manual compaction button.
- Automatic fresh-chat creation when budget is low.
- Latest compacted development state.
- Chat history metadata per provider session.

## Initial Build Order

1. Build the local WebSocket bridge between IDE extension and browser extension.
2. Show connected browser/provider state in the IDE.
3. Send a prompt from IDE to a browser tab.
4. Stream visible assistant text from browser tab to IDE.
5. Add a simple IDE chat webview.
6. Add session policy actions: continue, compact, rotate.
7. Add one provider adapter fully, starting with Gemini or ChatGPT.
8. Add tool-call format and one safe read-only tool.
9. Add edit preview/apply flow.
10. Expand provider adapters and context workflows.

## Design Guardrails

- Do not copy CodeWebChat source. Use it as product and architecture reference.
- Keep browser page selectors isolated in provider adapters.
- Keep workspace access only in the IDE extension.
- Treat web chat content as untrusted model output until parsed and approved.
- Prefer simple local protocols with strong diagnostics over clever hidden automation.
- Make every agent action visible, resumable, and recoverable.

