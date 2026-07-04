import { useEffect, useMemo, useReducer, useState } from "react";
import { flushSync } from "react-dom";
import type {
  BridgeStatusInfo,
  ContextInfo,
  FileChangeInfo,
  HostToWebview,
  ProviderInfo,
  SessionInfo,
  SessionUsageInfo,
  WebChatSettings
} from "../src/webview/messages";
import { onHostMessage, post } from "./vscodeApi";
import { ChatView } from "./Chat";
import { SettingsView } from "./Settings";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  turnId?: string;
  streaming?: boolean;
  files?: readonly FileChangeInfo[];
  summary?: string;
  nextSteps?: readonly string[];
  changeStatus?: "pending" | "applied" | "skipped" | "error";
  commands?: readonly string[];
  commandStatus?: "pending" | "running" | "done";
  kind?: "command";
  exitCode?: number;
  /** Estimated token count for this message (prompt tokens for user, response tokens for assistant). */
  tokens?: number;
  cancelled?: boolean;
}

interface State {
  view: "chat" | "settings";
  providers: readonly ProviderInfo[];
  currentProviderId: string;
  settings?: WebChatSettings;
  bridge: BridgeStatusInfo;
  usage?: SessionUsageInfo;
  context?: ContextInfo;
  messages: ChatMessage[];
  sessions: readonly SessionInfo[];
  fileSuggestions?: { query: string; files: readonly string[] };
  notice?: { level: "info" | "warn" | "error"; message: string };
}

type Action =
  | { type: "host"; message: HostToWebview }
  | { type: "setView"; view: "chat" | "settings" }
  | { type: "dismissNotice" };

const initialState: State = {
  view: "chat",
  providers: [],
  currentProviderId: "chatgpt",
  bridge: { running: false, port: 53451, clientCount: 0 },
  messages: [],
  sessions: []
};

function reducer(state: State, action: Action): State {
  if (action.type === "setView") {
    return { ...state, view: action.view };
  }
  if (action.type === "dismissNotice") {
    return { ...state, notice: undefined };
  }

  const message = action.message;
  switch (message.type) {
    case "init":
      return {
        ...state,
        providers: message.providers,
        currentProviderId: message.currentProviderId,
        settings: message.settings,
        bridge: message.bridge,
        usage: message.usage,
        context: message.context,
        sessions: message.sessions
      };
    case "bridgeStatus":
      return { ...state, bridge: message.bridge };
    case "sessions":
      return { ...state, sessions: message.sessions };
    case "providers":
      return { ...state, providers: message.providers };
    case "context":
      return { ...state, context: message.context };
    case "settings":
      return { ...state, settings: message.settings, currentProviderId: message.settings.defaultProvider };
    case "sessionUsage":
      return { ...state, usage: message.usage };
    case "navigate":
      return { ...state, view: message.view };
    case "fileList":
      return { ...state, fileSuggestions: { query: message.query, files: message.files } };
    case "notice":
      return { ...state, notice: { level: message.level, message: message.message } };
    case "promptDispatched": {
      const userMessage: ChatMessage = {
        id: `${message.turnId}-user`,
        role: "user",
        text: message.instruction,
        turnId: message.turnId,
        tokens: message.promptTokens
      };
      const assistantMessage: ChatMessage = {
        id: `${message.turnId}-assistant`,
        role: "assistant",
        turnId: message.turnId,
        streaming: message.clientCount > 0,
        text:
          message.clientCount > 0
            ? ""
            : "No browser is connected, so the prompt was copied to your clipboard. Click “open chat tab” (below or in the status bar) to launch a connected browser, then resend."
      };
      return { ...state, messages: [...state.messages, userMessage, assistantMessage] };
    }
    case "streamDelta":
      return {
        ...state,
        messages: updateAssistant(state.messages, message.turnId, (m) => ({
          ...m,
          text: message.fullText,
          streaming: true
        }))
      };
    case "streamDone":
      return {
        ...state,
        messages: updateAssistant(state.messages, message.turnId, (m) => ({
          ...m,
          // Use the cleaned display text verbatim (never fall back to the raw protocol text).
          text: message.displayText,
          streaming: false,
          tokens: message.responseTokens
        }))
      };
    case "promptCancelled":
      return {
        ...state,
        messages: updateAssistant(state.messages, message.turnId, (m) => ({
          ...m,
          streaming: false,
          cancelled: true,
          text: m.text && m.text.trim().length > 0 ? m.text : "Cancelled."
        }))
      };
    case "assistantParsed": {
      const mode = state.settings?.agentMode ?? "ask";
      const commandStatus =
        message.commands.length > 0 ? (mode === "auto" ? "running" : "pending") : undefined;
      return {
        ...state,
        messages: updateAssistant(state.messages, message.turnId, (m) => ({
          ...m,
          streaming: false,
          // If there was no prose around the tool block, show the human-friendly summary.
          text: m.text && m.text.trim().length > 0 ? m.text : message.summary,
          summary: message.summary,
          files: message.files,
          nextSteps: message.nextSteps,
          changeStatus: message.files.length > 0 ? "pending" : m.changeStatus,
          commands: message.commands,
          commandStatus
        }))
      };
    }
    case "applyResult":
      return {
        ...state,
        messages: markLatestPending(state.messages, message.error ? "error" : "applied")
      };
    case "commandOutput": {
      const outputMessage: ChatMessage = {
        id: `cmd-${state.messages.length}-${Math.random().toString(36).slice(2, 7)}`,
        role: "system",
        kind: "command",
        text: `$ ${message.command}\n${message.output || "(no output)"}`,
        exitCode: message.exitCode
      };
      return { ...state, messages: [...markCommandsDone(state.messages), outputMessage] };
    }
    default:
      return state;
  }
}

function updateAssistant(
  messages: ChatMessage[],
  turnId: string | undefined,
  update: (message: ChatMessage) => ChatMessage
): ChatMessage[] {
  // Update the most recent assistant message (optionally matching turnId).
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const candidate = messages[index];
    if (candidate.role === "assistant" && (!turnId || candidate.turnId === turnId)) {
      const next = messages.slice();
      next[index] = update(candidate);
      return next;
    }
  }
  return messages;
}

function markLatestPending(messages: ChatMessage[], status: ChatMessage["changeStatus"]): ChatMessage[] {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].changeStatus === "pending") {
      const next = messages.slice();
      next[index] = { ...messages[index], changeStatus: status };
      return next;
    }
  }
  return messages;
}

function markCommandsDone(messages: ChatMessage[]): ChatMessage[] {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const candidate = messages[index];
    if (candidate.commands && candidate.commands.length > 0 && candidate.commandStatus !== "done") {
      const next = messages.slice();
      next[index] = { ...candidate, commandStatus: "done" };
      return next;
    }
  }
  return messages;
}

export function App() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [booted, setBooted] = useState(false);

  useEffect(() => {
    const unsubscribe = onHostMessage((message) => {
      // Force a synchronous commit for streaming so the panel paints incrementally instead of
      // batching everything into one late render.
      if (message.type === "streamDelta" || message.type === "streamDone") {
        flushSync(() => dispatch({ type: "host", message }));
      } else {
        dispatch({ type: "host", message });
      }
    });
    post({ type: "ready" });
    setBooted(true);
    return unsubscribe;
  }, []);

  const currentProvider = useMemo(
    () => state.providers.find((provider) => provider.id === state.currentProviderId),
    [state.providers, state.currentProviderId]
  );

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-logo" aria-hidden="true">🪱</span>
          <span className="brand-mark">LeechCode</span>
          {currentProvider ? <span className="brand-sub">on {currentProvider.label}</span> : null}
        </div>
        <div className="topbar-actions">
          <select
            className="provider-select"
            value={state.currentProviderId}
            onChange={(event) => post({ type: "switchProvider", providerId: event.target.value })}
            title="Active web chat provider"
          >
            {state.providers.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {provider.label}
              </option>
            ))}
          </select>
          <button
            className="icon-btn"
            title="New chat — clears this panel's conversation, token budget and stored summary, and starts a fresh session (your chat history list is kept)"
            onClick={() => post({ type: "sessionAction", action: "reset" })}
          >
            ⟳
          </button>
          <button
            className={`icon-btn ${state.view === "settings" ? "active" : ""}`}
            title={state.view === "settings" ? "Close settings" : "Settings"}
            onClick={() => dispatch({ type: "setView", view: state.view === "settings" ? "chat" : "settings" })}
          >
            {state.view === "settings" ? "✕" : "⚙"}
          </button>
        </div>
      </header>

      {state.notice ? (
        <div className={`notice notice-${state.notice.level}`} onClick={() => dispatch({ type: "dismissNotice" })}>
          {state.notice.message}
        </div>
      ) : null}

      {state.view === "settings" && state.settings ? (
        <SettingsView
          settings={state.settings}
          providers={state.providers}
          bridge={state.bridge}
          onBack={() => dispatch({ type: "setView", view: "chat" })}
        />
      ) : (
        <ChatView
          messages={state.messages}
          usage={state.usage}
          bridge={state.bridge}
          context={state.context}
          settings={state.settings}
          fileSuggestions={state.fileSuggestions}
          provider={currentProvider}
          sessions={state.sessions}
          booted={booted}
        />
      )}
    </div>
  );
}
