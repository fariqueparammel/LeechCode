export const PROTOCOL_VERSION = 1;

export type BridgeMessageType =
  | "pair.request"
  | "pair.accepted"
  | "bridge.status"
  | "chat.open"
  | "chat.prompt"
  | "chat.cancel"
  | "chat.model"
  | "chat.toggle"
  | "chat.navigate"
  | "chat.selectors"
  | "chat.probe"
  | "chat.probe.result"
  | "chat.stream.delta"
  | "chat.stream.done"
  | "chat.state"
  | "chat.error";

export interface BridgeEnvelope<TPayload = unknown> {
  readonly version: typeof PROTOCOL_VERSION;
  readonly id: string;
  readonly sessionId: string;
  readonly type: BridgeMessageType;
  readonly createdAt: string;
  readonly payload: TPayload;
}

export interface ChatPromptPayload {
  readonly providerId: string;
  readonly chatUrl: string;
  readonly prompt: string;
  readonly promptNumber: number;
  readonly expectedAction: "submit" | "compact" | "continue" | "rotate";
  readonly autoSubmit?: boolean;
  /**
   * Set on the messages of a chunked codebase-index delivery (1-based). Informational: lets the
   * browser/UI show "part k of n" and know a short acknowledgement (not a full answer) is expected.
   */
  readonly chunkIndex?: number;
  readonly chunkTotal?: number;
  /** Images/files pasted or attached in the panel, to inject into the provider page (best-effort). */
  readonly attachments?: readonly ChatAttachment[];
}

export interface ChatAttachment {
  readonly name: string;
  readonly mimeType: string;
  /** Base64 (no data: prefix) of the file/image bytes. */
  readonly dataBase64: string;
}

export interface ChatCancelPayload {
  readonly providerId?: string;
  /** Optional human reason surfaced by the content script. */
  readonly reason?: string;
}

export interface ChatModelPayload {
  readonly providerId?: string;
  /** The model name to select in the provider's on-page model picker (best-effort). */
  readonly model: string;
}

export interface ChatTogglePayload {
  readonly providerId?: string;
  readonly featureId: string;
  /** Visible label of the on-page toggle button to click (e.g. "Search", "DeepThink"). */
  readonly label: string;
}

export interface ChatNavigatePayload {
  readonly providerId?: string;
  /** A previously-used conversation URL to navigate the provider tab to and continue in. */
  readonly url: string;
}

/** User-editable CSS-selector overrides for one provider's page (tried before the built-ins). */
export interface ProviderSelectorOverride {
  readonly inputSelectors?: readonly string[];
  readonly submitSelectors?: readonly string[];
  readonly assistantSelectors?: readonly string[];
}

/**
 * Full override map (keyed by provider id) pushed to the browser whenever it changes or a browser
 * (re)connects. The browser persists it in chrome.storage.local so every page of that provider
 * applies it on load, even before the bridge is up.
 */
export interface ChatSelectorsPayload {
  readonly overrides: Readonly<Record<string, ProviderSelectorOverride>>;
}

export interface ChatProbePayload {
  readonly providerId?: string;
}

/** Which selector (if any) matched each role on the live page — the GUI's test feedback. */
export interface ChatProbeResultPayload {
  readonly providerId: string;
  readonly url?: string;
  readonly input: string | null;
  readonly submit: string | null;
  readonly assistant: string | null;
  /** Character count of the reply container's current text (sanity signal for the assistant selector). */
  readonly assistantChars: number;
}

export interface ChatStreamDeltaPayload {
  readonly providerId?: string;
  readonly text: string;
  readonly fullText?: string;
}

export interface ChatStreamDonePayload {
  readonly providerId?: string;
  readonly fullText: string;
  readonly finishReason: "complete" | "limit" | "blocked" | "unknown";
}

export interface ChatStatePayload {
  readonly state:
    | "ready"
    | "login-required"
    | "prompt-inserted"
    | "submitting"
    | "streaming"
    | "waiting-response"
    | "complete"
    | "limit-hit"
    | "blocked";
  readonly detail?: string;
}

export interface PairRequestPayload {
  readonly clientKind: "browser-extension";
  readonly userAgent: string;
  readonly extensionVersion?: string;
}

export interface PairAcceptedPayload {
  readonly clientId: string;
  readonly connectedClients: number;
}

export function createEnvelope<TPayload>(
  input: Omit<BridgeEnvelope<TPayload>, "version" | "createdAt">
): BridgeEnvelope<TPayload> {
  return {
    ...input,
    version: PROTOCOL_VERSION,
    createdAt: new Date().toISOString()
  };
}
