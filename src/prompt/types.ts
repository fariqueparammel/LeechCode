import type { WebChatProvider } from "../providers/types";

export interface PromptFile {
  readonly path: string;
  readonly languageId?: string;
  readonly content: string;
}

export interface BuildPromptInput {
  readonly provider?: WebChatProvider;
  readonly instruction: string;
  readonly files: readonly PromptFile[];
}
