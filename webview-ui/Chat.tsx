import { useEffect, useRef, useState } from "react";
import {
  CODEBASE_CONTEXT_TOKEN,
  type BridgeStatusInfo,
  type ContextInfo,
  type PromptAttachment,
  type ProviderInfo,
  type SessionInfo,
  type SessionUsageInfo,
  type WebChatSettings
} from "../src/webview/messages";
import type { ChatMessage } from "./App";
import { post, uuid } from "./vscodeApi";

interface ChatViewProps {
  messages: readonly ChatMessage[];
  usage?: SessionUsageInfo;
  bridge: BridgeStatusInfo;
  context?: ContextInfo;
  settings?: WebChatSettings;
  fileSuggestions?: { query: string; files: readonly string[] };
  provider?: ProviderInfo;
  sessions: readonly SessionInfo[];
  booted: boolean;
}

export function ChatView({ messages, usage, bridge, context, settings, fileSuggestions, provider, sessions, booted }: ChatViewProps) {
  return (
    <div className="chat">
      <StatusStrip usage={usage} bridge={bridge} />
      <SessionBar sessions={sessions} />
      <MessageList messages={messages} booted={booted} />
      <Composer context={context} mode={settings?.agentMode ?? "ask"} fileSuggestions={fileSuggestions} provider={provider} />
    </div>
  );
}

function StatusStrip({ usage, bridge }: { usage?: SessionUsageInfo; bridge: BridgeStatusInfo }) {
  const connected = bridge.running && bridge.clientCount > 0;
  const used = usage?.totalTokensUsed ?? 0;
  const max = usage?.maxContextTokens ?? 1;
  const pct = Math.min(100, Math.round((used / Math.max(1, max)) * 100));
  const near = usage?.nextAction === "rotate";

  return (
    <div className="status-strip">
      <span className={`dot ${connected ? "ok" : bridge.running ? "warn" : "off"}`} />
      <span className="status-label">
        {connected
          ? `${bridge.clientCount} browser connected`
          : bridge.running
            ? "Bridge up · no browser"
            : "Bridge offline"}
      </span>
      {!connected ? (
        <button
          className="link-btn"
          title="Launch a browser with the WebChat extension and open the chat"
          onClick={() => post({ type: "launchBrowser" })}
        >
          open chat tab
        </button>
      ) : (
        <button
          className="link-btn"
          title="Close the WebChat browser instance"
          onClick={() => post({ type: "closeBrowser" })}
        >
          close browser
        </button>
      )}
      <div className="budget" title={`${used.toLocaleString()} / ${max.toLocaleString()} context tokens`}>
        <div className={`budget-bar ${near ? "near" : ""}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`status-label ${near ? "warn-text" : ""}`}>{pct}%</span>
      {usage && usage.nextAction !== "continue" ? (
        <button
          className="link-btn"
          title={usage.nextAction === "rotate" ? "Start a fresh chat from the compacted summary" : "Compact the session"}
          onClick={() => post({ type: "sessionAction", action: usage.nextAction === "rotate" ? "rotate" : "compact" })}
        >
          {usage.nextAction === "rotate" ? "new chat" : "compact"}
        </button>
      ) : null}
      {connected ? (
        <button className="link-btn" title="Re-send the last message (e.g. after a login/rate-limit block)" onClick={() => post({ type: "retryLast" })}>
          retry
        </button>
      ) : null}
    </div>
  );
}

function SessionBar({ sessions }: { sessions: readonly SessionInfo[] }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");

  const go = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) {
      return;
    }
    post({ type: "openChatUrl", url: trimmed });
    setUrl("");
    setOpen(false);
  };

  const label = (s: SessionInfo) => s.title || `${s.providerLabel} · ${shortUrl(s.url)}`;

  return (
    <div className="session-bar">
      <button className="session-toggle" title="Continue a previous chat by URL" onClick={() => setOpen((v) => !v)}>
        🔗 Continue a chat{sessions.length > 0 ? ` (${sessions.length})` : ""} {open ? "▾" : "▸"}
      </button>
      {open ? (
        <div className="session-panel">
          <p className="session-guide">
            Open a past conversation in your browser, copy its URL from the address bar, and paste it here —
            LeechCode switches the tab to that chat and continues in it (keeping its history). It also lists chats
            you've used below.
          </p>
          <div className="session-input-row">
            <input
              className="session-input"
              placeholder="Paste a chat URL, e.g. https://chatgpt.com/c/…"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  go(url);
                }
              }}
            />
            <button className="btn primary" disabled={!url.trim()} onClick={() => go(url)}>
              Open
            </button>
          </div>
          {sessions.length > 0 ? (
            <ul className="session-list">
              {sessions.map((s) => (
                <li key={s.url}>
                  <button className="session-item" title={s.url} onClick={() => go(s.url)}>
                    <span className="session-item-title">{label(s)}</span>
                    <span className="session-item-provider">{s.providerLabel}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="session-empty">No chats tracked yet — send a message (or open one by URL) and it'll appear here.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}

function shortUrl(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname.length > 22 ? `${u.pathname.slice(0, 20)}…` : u.pathname;
    return `${u.hostname}${path}`;
  } catch {
    return url.slice(0, 40);
  }
}

function formatTokens(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k tok` : `${n} tok`;
}

function MessageList({ messages, booted }: { messages: readonly ChatMessage[]; booted: boolean }) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="messages empty">
        <div className="empty-state">
          <p className="empty-title">🪱 Leech a browser AI chat from your editor</p>
          <p className="empty-sub">
            {booted
              ? "Pick a provider above, open a connected chat tab, then describe what you want built. LeechCode feeds your project context to the chat and applies the response back here — free, using your logged-in session."
              : "Connecting…"}
          </p>
          {booted ? (
            <button className="btn primary" onClick={() => post({ type: "launchBrowser" })}>
              Open chat tab in browser
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="messages">
      {messages.map((message) => (
        <MessageItem key={message.id} message={message} />
      ))}
      <div ref={endRef} />
    </div>
  );
}

function MessageItem({ message }: { message: ChatMessage }) {
  if (message.kind === "command") {
    return (
      <div className="msg msg-system">
        <div className={`command-output ${message.exitCode === 0 ? "ok" : "fail"}`}>
          <div className="command-output-head">
            <span>terminal</span>
            <span className="exit">exit {message.exitCode}</span>
          </div>
          <pre>{message.text}</pre>
        </div>
      </div>
    );
  }

  return (
    <div className={`msg msg-${message.role}`}>
      <div className="msg-role">
        <span>{message.role === "user" ? "You" : message.role === "assistant" ? "Assistant" : "WebChat"}</span>
        {typeof message.tokens === "number" && message.tokens > 0 ? (
          <span className="msg-tokens" title="Estimated tokens (chars ÷ 4)">
            {formatTokens(message.tokens)}
          </span>
        ) : null}
      </div>
      {message.text ? (
        <div className="msg-text">
          {message.text}
          {message.streaming ? <span className="cursor">▍</span> : null}
        </div>
      ) : message.streaming ? (
        <div className="msg-text muted">
          thinking<span className="cursor">▍</span>
        </div>
      ) : null}
      {message.streaming ? (
        <button
          className="btn ghost stop-btn"
          title="Stop generating and tell the chat to disregard this message"
          onClick={() => post({ type: "cancelPrompt", turnId: message.turnId })}
        >
          ⏹ Stop
        </button>
      ) : null}
      {message.files && message.files.length > 0 ? <FileChangeCard message={message} /> : null}
      {message.commands && message.commands.length > 0 ? <CommandCard message={message} /> : null}
      {message.nextSteps && message.nextSteps.length > 0 ? (
        <ul className="next-steps">
          {message.nextSteps.map((step, index) => (
            <li key={index}>{step}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function CommandCard({ message }: { message: ChatMessage }) {
  const commands = message.commands ?? [];
  const [acted, setActed] = useState<null | "running" | "skipped">(null);
  const hostStatus = message.commandStatus ?? "pending";
  const status = hostStatus === "done" ? "done" : hostStatus === "running" ? "running" : acted ?? "pending";

  return (
    <div className={`command-card status-${status}`}>
      <div className="change-head">
        <span className="change-title">
          {commands.length} command{commands.length === 1 ? "" : "s"}
        </span>
        <span className="change-status">{commandStatusLabel(status)}</span>
      </div>
      <ul className="command-list">
        {commands.map((command, index) => (
          <li key={index}>
            <code>$ {command}</code>
          </li>
        ))}
      </ul>
      {status === "pending" ? (
        <div className="change-actions">
          <button
            className="btn primary"
            onClick={() => {
              setActed("running");
              post({ type: "runCommands", turnId: message.turnId });
            }}
          >
            Approve &amp; run
          </button>
          <button
            className="btn ghost"
            onClick={() => {
              setActed("skipped");
              post({ type: "skipCommands", turnId: message.turnId });
            }}
          >
            Skip
          </button>
        </div>
      ) : null}
    </div>
  );
}

function commandStatusLabel(status: "pending" | "running" | "done" | "skipped"): string {
  switch (status) {
    case "running":
      return "running…";
    case "done":
      return "ran";
    case "skipped":
      return "skipped";
    default:
      return "approve to run";
  }
}

function FileChangeCard({ message }: { message: ChatMessage }) {
  const files = message.files ?? [];
  const [acted, setActed] = useState<null | "applying" | "skipped">(null);
  const hostStatus = message.changeStatus ?? "pending";
  const status = hostStatus !== "pending" ? hostStatus : acted ?? "pending";
  const showActions = status === "pending";

  return (
    <div className={`change-card status-${status}`}>
      <div className="change-head">
        <span className="change-title">
          {files.length} file change{files.length === 1 ? "" : "s"}
        </span>
        <span className={`change-status ${status}`}>{statusLabel(status)}</span>
      </div>
      <ul className="change-list">
        {files.map((file) => (
          <li key={file.path}>
            <span className={`badge ${file.action}`}>{file.action}</span>
            <button
              className="file-diff-link"
              title="Open the diff for this file"
              onClick={() => post({ type: "previewChanges", turnId: message.turnId, path: file.path })}
            >
              <code>{file.path}</code>
            </button>
          </li>
        ))}
      </ul>
      {showActions ? (
        <div className="change-actions">
          <button
            className="btn primary"
            onClick={() => {
              setActed("applying");
              post({ type: "applyChanges", turnId: message.turnId, files });
            }}
          >
            Apply
          </button>
          <button className="btn ghost" onClick={() => post({ type: "previewChanges", turnId: message.turnId })}>
            View diff
          </button>
          <button
            className="btn ghost"
            onClick={() => {
              setActed("skipped");
              post({ type: "skipChanges", turnId: message.turnId });
            }}
          >
            Skip
          </button>
        </div>
      ) : null}
    </div>
  );
}

function statusLabel(status: "pending" | "applying" | "applied" | "skipped" | "error"): string {
  switch (status) {
    case "applying":
      return "applying…";
    case "applied":
      return "applied";
    case "skipped":
      return "skipped";
    case "error":
      return "error";
    default:
      return "review";
  }
}

interface MentionState {
  query: string;
  start: number;
}

interface MentionItem {
  value: string;
  name: string;
  path: string;
}

const SLASH_COMMANDS: { cmd: string; desc: string }[] = [
  { cmd: "index", desc: "Index the entire codebase as context" },
  { cmd: "ask", desc: "Ask mode — review a diff before applying" },
  { cmd: "auto", desc: "Auto-edit mode — apply changes automatically" },
  { cmd: "plan", desc: "Plan mode — propose a plan, make no edits" },
  { cmd: "compact", desc: "Compact the session now" },
  { cmd: "clear", desc: "Reset the session (new chat)" },
  { cmd: "open", desc: "Open the chat tab in a browser" },
  { cmd: "close", desc: "Close the WebChat browser instance" }
];

function buildMentionItems(
  query: string,
  fileSuggestions: { query: string; files: readonly string[] } | undefined,
  attached: readonly string[]
): MentionItem[] {
  const q = query.toLowerCase();
  const items: MentionItem[] = [];
  if ("codebase".startsWith(q) && !attached.includes(CODEBASE_CONTEXT_TOKEN)) {
    items.push({ value: CODEBASE_CONTEXT_TOKEN, name: "Entire codebase", path: "index all source files" });
  }
  for (const file of fileSuggestions?.files ?? []) {
    if (items.length >= 9) {
      break;
    }
    if (!file.toLowerCase().includes(q) || attached.includes(file)) {
      continue;
    }
    items.push({ value: file, name: file.slice(file.lastIndexOf("/") + 1), path: file });
  }
  return items;
}

function chipLabel(value: string): string {
  return value === CODEBASE_CONTEXT_TOKEN ? "codebase" : value.slice(value.lastIndexOf("/") + 1);
}

interface ComposerAttachment extends PromptAttachment {
  id: string;
  isImage: boolean;
}

function fileToAttachment(file: File): Promise<ComposerAttachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const dataBase64 = result.includes(",") ? result.slice(result.indexOf(",") + 1) : result;
      const mimeType = file.type || "application/octet-stream";
      resolve({
        id: uuid(),
        name: file.name || (mimeType.startsWith("image/") ? "pasted-image.png" : "attachment"),
        mimeType,
        dataBase64,
        isImage: mimeType.startsWith("image/")
      });
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function Composer({
  context,
  mode,
  fileSuggestions,
  provider
}: {
  context?: ContextInfo;
  mode: WebChatSettings["agentMode"];
  fileSuggestions?: { query: string; files: readonly string[] };
  provider?: ProviderInfo;
}) {
  const [text, setText] = useState("");
  const [attached, setAttached] = useState<string[]>([]);
  const [files, setFiles] = useState<ComposerAttachment[]>([]);
  const [activeFeatures, setActiveFeatures] = useState<Set<string>>(new Set());
  const [mention, setMention] = useState<MentionState | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addFiles = (list: FileList | File[] | null | undefined) => {
    const arr = list ? [...list] : [];
    if (arr.length === 0) {
      return;
    }
    Promise.all(arr.map(fileToAttachment)).then((atts) => setFiles((prev) => [...prev, ...atts]));
  };

  const onPaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = event.clipboardData?.items;
    if (!items) {
      return;
    }
    const imgs: File[] = [];
    for (const item of items) {
      if (item.kind === "file" && item.type.startsWith("image/")) {
        const f = item.getAsFile();
        if (f) {
          imgs.push(f);
        }
      }
    }
    if (imgs.length > 0) {
      event.preventDefault();
      addFiles(imgs);
    }
  };

  // Slash command menu is active when the entire input is "/word".
  const slashMatch = text.match(/^\/(\w*)$/);
  const slashItems = slashMatch
    ? SLASH_COMMANDS.filter((command) => command.cmd.startsWith(slashMatch[1].toLowerCase()))
    : [];
  // @-mention file items (with a codebase entry), only when not in slash mode.
  const fileItems = !slashMatch && mention ? buildMentionItems(mention.query, fileSuggestions, attached) : [];

  const menuKind: "slash" | "mention" | null = slashItems.length ? "slash" : fileItems.length ? "mention" : null;
  const menuLength = menuKind === "slash" ? slashItems.length : fileItems.length;

  const detectMention = (value: string, cursor: number) => {
    if (/^\/(\w*)$/.test(value)) {
      setMention(null);
      return;
    }
    const before = value.slice(0, cursor);
    const match = before.match(/(^|\s)@([^\s@]*)$/);
    if (match) {
      const query = match[2];
      setMention({ query, start: cursor - query.length - 1 });
      setActiveIndex(0);
      post({ type: "requestFiles", query });
    } else {
      setMention(null);
    }
  };

  const onChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = event.target.value;
    setText(value);
    if (/^\/(\w*)$/.test(value)) {
      setActiveIndex(0);
      setMention(null);
    } else {
      detectMention(value, event.target.selectionStart ?? value.length);
    }
  };

  const attach = (value: string) => setAttached((prev) => (prev.includes(value) ? prev : [...prev, value]));

  const selectFile = (value: string) => {
    attach(value);
    if (mention) {
      const tokenEnd = mention.start + 1 + mention.query.length;
      setText((prev) => prev.slice(0, mention.start) + prev.slice(tokenEnd));
    }
    setMention(null);
    setActiveIndex(0);
    inputRef.current?.focus();
  };

  const runSlash = (cmd: string) => {
    switch (cmd) {
      case "index":
        attach(CODEBASE_CONTEXT_TOKEN);
        break;
      case "ask":
      case "auto":
      case "plan":
        post({ type: "updateSetting", key: "agentMode", value: cmd });
        break;
      case "compact":
        post({ type: "sessionAction", action: "compact" });
        break;
      case "clear":
        post({ type: "sessionAction", action: "reset" });
        break;
      case "open":
        post({ type: "launchBrowser" });
        break;
      case "close":
        post({ type: "closeBrowser" });
        break;
    }
    setText("");
    setActiveIndex(0);
    inputRef.current?.focus();
  };

  const commit = () => {
    if (menuKind === "slash") {
      runSlash(slashItems[Math.min(activeIndex, slashItems.length - 1)].cmd);
    } else if (menuKind === "mention") {
      selectFile(fileItems[Math.min(activeIndex, fileItems.length - 1)].value);
    }
  };

  const send = () => {
    const trimmed = text.trim();
    if (!trimmed && files.length === 0) {
      return;
    }
    post({
      type: "sendPrompt",
      turnId: uuid(),
      text: trimmed || "(see attached image)",
      contextPaths: attached,
      attachments: files.length > 0 ? files.map(({ name, mimeType, dataBase64 }) => ({ name, mimeType, dataBase64 })) : undefined
    });
    setText("");
    setAttached([]);
    setFiles([]);
    setMention(null);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (menuKind && menuLength > 0) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIndex((index) => (index + 1) % menuLength);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex((index) => (index - 1 + menuLength) % menuLength);
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        commit();
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setMention(null);
        if (slashMatch) {
          setText("");
        }
        return;
      }
    }

    const composing = (event.nativeEvent as unknown as { isComposing?: boolean }).isComposing;
    if (event.key === "Enter" && !event.shiftKey && !composing) {
      event.preventDefault();
      send();
    }
  };

  return (
    <div className="composer">
      {menuKind === "slash" ? (
        <ul className="mention-list">
          {slashItems.map((item, index) => (
            <li
              key={item.cmd}
              className={index === activeIndex ? "active" : ""}
              onMouseDown={(event) => {
                event.preventDefault();
                runSlash(item.cmd);
              }}
            >
              <span className="mention-name">/{item.cmd}</span>
              <span className="mention-path">{item.desc}</span>
            </li>
          ))}
        </ul>
      ) : menuKind === "mention" ? (
        <ul className="mention-list">
          {fileItems.map((item, index) => (
            <li
              key={item.value}
              className={index === activeIndex ? "active" : ""}
              onMouseDown={(event) => {
                event.preventDefault();
                selectFile(item.value);
              }}
            >
              <span className="mention-name">{item.name}</span>
              <span className="mention-path">{item.path}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="context-chip">
        {context?.path ? (
          <span title="Active editor context sent with your prompt">
            {context.selectionOnly && context.hasSelection ? "selection · " : ""}
            {context.path}
          </span>
        ) : (
          <span className="muted">No active editor context</span>
        )}
      </div>

      {attached.length > 0 ? (
        <div className="attached-chips">
          {attached.map((value) => (
            <span className="attach-chip" key={value} title={value === CODEBASE_CONTEXT_TOKEN ? "Entire codebase" : value}>
              @{chipLabel(value)}
              <button
                className="attach-remove"
                title="Remove"
                onClick={() => setAttached((prev) => prev.filter((path) => path !== value))}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      ) : null}

      {files.length > 0 ? (
        <div className="attachment-previews">
          {files.map((f) => (
            <div className="attachment" key={f.id} title={f.name}>
              {f.isImage ? (
                <img className="attachment-thumb" src={`data:${f.mimeType};base64,${f.dataBase64}`} alt={f.name} />
              ) : (
                <span className="attachment-file">📄</span>
              )}
              <span className="attachment-name">{f.name}</span>
              <button
                className="attach-remove"
                title="Remove"
                onClick={() => setFiles((prev) => prev.filter((x) => x.id !== f.id))}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      ) : null}

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,.txt,.md,.json,.log,.csv,.ts,.js,.py,.html,.css"
        style={{ display: "none" }}
        onChange={(event) => {
          addFiles(event.target.files);
          event.target.value = "";
        }}
      />

      <textarea
        ref={inputRef}
        className="composer-input"
        placeholder="Ask LeechCode…   @ files · / commands · paste a screenshot · Enter to send"
        value={text}
        rows={3}
        onChange={onChange}
        onPaste={onPaste}
        onKeyUp={(event) => detectMention(event.currentTarget.value, event.currentTarget.selectionStart ?? 0)}
        onClick={(event) => detectMention(event.currentTarget.value, event.currentTarget.selectionStart ?? 0)}
        onKeyDown={onKeyDown}
      />
      <div className="composer-actions">
        <button
          className="icon-btn attach-btn"
          title="Attach files or images (or paste a screenshot into the box)"
          onClick={() => fileInputRef.current?.click()}
        >
          ＋
        </button>
        <select
          className="mode-select"
          value={mode}
          title="Agent mode — controls how LeechCode instructs the model and applies changes"
          onChange={(event) => post({ type: "updateSetting", key: "agentMode", value: event.target.value })}
        >
          <option value="ask">Ask</option>
          <option value="auto">Auto-edit</option>
          <option value="plan">Plan</option>
          <option value="bypass">Bypass</option>
        </select>
        {provider?.models && provider.models.length > 0 ? (
          <select
            className="model-select"
            value=""
            title="Switch the model on the web chat (best-effort)"
            onChange={(event) => {
              if (event.target.value) {
                post({ type: "setModel", model: event.target.value });
                event.currentTarget.selectedIndex = 0;
              }
            }}
          >
            <option value="">model…</option>
            {provider.models.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        ) : null}
        {(provider?.features ?? []).map((feature) => (
          <button
            key={feature.id}
            className={`feature-toggle ${activeFeatures.has(feature.id) ? "on" : ""}`}
            title={`Toggle "${feature.label}" on ${provider?.label ?? "the chat"} (best-effort)`}
            onClick={() => {
              post({ type: "toggleFeature", featureId: feature.id });
              setActiveFeatures((prev) => {
                const next = new Set(prev);
                if (next.has(feature.id)) {
                  next.delete(feature.id);
                } else {
                  next.add(feature.id);
                }
                return next;
              });
            }}
          >
            {feature.icon ? `${feature.icon} ` : ""}
            {feature.label}
          </button>
        ))}
        <div className="composer-right">
          <button
            className="link-btn"
            title="Launch a browser with the WebChat extension and open the chat tab"
            onClick={() => post({ type: "launchBrowser" })}
          >
            open chat
          </button>
          <button className="btn primary send" disabled={!text.trim() && files.length === 0} onClick={send}>
            Send ▶
          </button>
        </div>
      </div>
    </div>
  );
}
