export type ProviderId = "chatgpt" | "claude" | "gemini" | "qwen" | "deepseek" | "aistudio" | "mock";

/** How generous the provider's image/vision handling is on a typical free/logged-in session. */
export type ImageSupport = "unlimited" | "generous" | "limited" | "none";

/** A toggle-able on-page feature (e.g. DeepSeek's Search / DeepThink), clicked via the content script. */
export interface ProviderFeature {
  readonly id: string;
  readonly label: string;
  readonly icon?: string;
}

export interface WebChatProvider {
  readonly id: ProviderId;
  readonly label: string;
  readonly host: string;
  readonly chatUrl: string;
  /** Capability tags shown in the UI, e.g. ["chat", "vision"]. */
  readonly tags?: readonly string[];
  /** Rough image-upload generosity — helps pick a provider for heavy image work. */
  readonly imageSupport?: ImageSupport;
  /** Common model names for the on-page model switcher (approximate; providers change these often). */
  readonly models?: readonly string[];
  /** Toggle-able on-page features surfaced as buttons in the composer (e.g. Search / DeepThink). */
  readonly features?: readonly ProviderFeature[];
  /** Default safe per-message character limit for this chat's input box (customizable in settings). */
  readonly maxMessageChars?: number;
  /**
   * Default safe total character budget for one chat conversation with this provider — used to cap
   * how much of a whole-codebase index we deliver so we don't blow the session window (customizable
   * in settings).
   */
  readonly maxSessionChars?: number;
}
