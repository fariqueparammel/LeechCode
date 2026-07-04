// Shared message contract between the extension host (panelProvider.ts) and the React webview
// (webview-ui/). Both sides import this file so the postMessage protocol stays typed end to end.

/** Sentinel context path meaning "index the entire workspace" (used by @codebase and /index). */
export const CODEBASE_CONTEXT_TOKEN = "::codebase::";

export interface ProviderInfo {
  readonly id: string;
  readonly label: string;
  readonly host: string;
  readonly tags?: readonly string[];
  readonly imageSupport?: string;
  readonly models?: readonly string[];
  readonly features?: readonly { id: string; label: string; icon?: string }[];
}

export interface FileChangeInfo {
  readonly path: string;
  readonly action: "write" | "delete";
}

export interface SessionUsageInfo {
  readonly promptCount: number;
  readonly inputTokensUsed: number;
  readonly outputTokensUsed: number;
  readonly totalTokensUsed: number;
  readonly maxContextTokens: number;
  readonly maxInputTokens: number;
  readonly maxOutputTokens: number;
  readonly nextAction: "continue" | "compact" | "rotate";
}

export interface BridgeStatusInfo {
  readonly running: boolean;
  readonly port: number;
  readonly clientCount: number;
}

export interface WebChatSettings {
  readonly defaultProvider: string;
  readonly includeSelectionOnly: boolean;
  readonly autoSubmit: boolean;
  readonly agentMode: "ask" | "auto" | "plan" | "bypass";
  readonly applyMode: "ask" | "auto" | "never";
  readonly autoRepair: boolean;
  /** Effective per-message character limit for the current provider (customizable). */
  readonly messageLimit: number;
  /** Effective total conversation character budget for the current provider (caps a chunked index). */
  readonly sessionLimit: number;
  /** Split a too-large @codebase index into several ordered messages instead of truncating it. */
  readonly indexChunked: boolean;
  readonly currentProviderLabel: string;
  readonly bridgePort: number;
  readonly bridgeToken: string;
  readonly maxContextTokens: number;
  readonly maxInputTokens: number;
  readonly maxOutputTokens: number;
  readonly compactEveryPrompts: number;
  readonly rotateWhenBudgetRemainingBelow: number;
  /** Local vision model (image → text) so limited web-chat image support is bypassed. */
  readonly visionEnabled: boolean;
  readonly visionEndpoint: string;
  readonly visionModel: string;
}

export interface ContextInfo {
  readonly path?: string;
  readonly selectionOnly: boolean;
  readonly hasSelection: boolean;
}

export type NoticeLevel = "info" | "warn" | "error";

/** A web chat conversation the extension has seen / used, so the user can jump back into it. */
export interface SessionInfo {
  readonly url: string;
  readonly providerId: string;
  readonly providerLabel: string;
  readonly title?: string;
  readonly lastUsed: string;
  /** Compacted project-state summary captured while this chat was active — re-injected on resume. */
  readonly summary?: string;
}

/** An image/file attached in the composer, sent to the browser to inject into the provider page. */
export interface PromptAttachment {
  readonly name: string;
  readonly mimeType: string;
  /** Base64 (no data: prefix). */
  readonly dataBase64: string;
}

// ---- Host -> Webview ---------------------------------------------------------------------------
export type HostToWebview =
  | {
      readonly type: "init";
      readonly providers: readonly ProviderInfo[];
      readonly currentProviderId: string;
      readonly settings: WebChatSettings;
      readonly bridge: BridgeStatusInfo;
      readonly usage: SessionUsageInfo;
      readonly summary: string;
      readonly context: ContextInfo;
      readonly sessions: readonly SessionInfo[];
    }
  | { readonly type: "bridgeStatus"; readonly bridge: BridgeStatusInfo }
  | { readonly type: "sessions"; readonly sessions: readonly SessionInfo[] }
  | { readonly type: "providers"; readonly providers: readonly ProviderInfo[] }
  | { readonly type: "context"; readonly context: ContextInfo }
  | { readonly type: "settings"; readonly settings: WebChatSettings }
  | { readonly type: "sessionUsage"; readonly usage: SessionUsageInfo }
  // a prompt was dispatched; echo the user-facing instruction into the chat
  | {
      readonly type: "promptDispatched";
      readonly turnId: string;
      readonly instruction: string;
      readonly action: "submit" | "compact" | "rotate" | "continue";
      readonly clientCount: number;
      readonly promptTokens: number;
    }
  | { readonly type: "streamDelta"; readonly turnId?: string; readonly text: string; readonly fullText: string }
  | { readonly type: "streamDone"; readonly turnId?: string; readonly displayText: string; readonly responseTokens: number }
  | { readonly type: "promptCancelled"; readonly turnId?: string }
  | {
      readonly type: "assistantParsed";
      readonly turnId?: string;
      readonly summary: string;
      readonly files: readonly FileChangeInfo[];
      readonly commands: readonly string[];
      readonly nextSteps: readonly string[];
    }
  | { readonly type: "applyResult"; readonly applied: readonly FileChangeInfo[]; readonly error?: string }
  | {
      readonly type: "commandOutput";
      readonly command: string;
      readonly output: string;
      readonly exitCode: number;
    }
  | { readonly type: "navigate"; readonly view: "chat" | "settings" }
  | { readonly type: "fileList"; readonly query: string; readonly files: readonly string[] }
  | { readonly type: "notice"; readonly level: NoticeLevel; readonly message: string };

// ---- Webview -> Host ---------------------------------------------------------------------------
export type WebviewToHost =
  | { readonly type: "ready" }
  | {
      readonly type: "sendPrompt";
      readonly turnId: string;
      readonly text: string;
      readonly contextPaths?: readonly string[];
      readonly attachments?: readonly PromptAttachment[];
    }
  | { readonly type: "requestFiles"; readonly query: string }
  | { readonly type: "switchProvider"; readonly providerId: string }
  | { readonly type: "openExternalProvider" }
  | { readonly type: "launchBrowser" }
  | { readonly type: "closeBrowser" }
  | { readonly type: "startBridge" }
  | { readonly type: "sessionAction"; readonly action: "compact" | "rotate" | "reset" }
  | { readonly type: "applyChanges"; readonly turnId?: string; readonly files: readonly FileChangeInfo[] }
  | { readonly type: "previewChanges"; readonly turnId?: string; readonly path?: string }
  | { readonly type: "skipChanges"; readonly turnId?: string }
  | { readonly type: "runCommands"; readonly turnId?: string }
  | { readonly type: "skipCommands"; readonly turnId?: string }
  | { readonly type: "cancelPrompt"; readonly turnId?: string }
  | { readonly type: "setModel"; readonly model: string }
  | { readonly type: "setProviderModels"; readonly providerId: string; readonly models: readonly string[] }
  | { readonly type: "toggleFeature"; readonly featureId: string }
  | { readonly type: "openChatUrl"; readonly url: string }
  | { readonly type: "removeSession"; readonly url: string }
  | { readonly type: "clearSessions" }
  | { readonly type: "retryLast" }
  | { readonly type: "updateSetting"; readonly key: keyof WebChatSettings; readonly value: string | number | boolean };
