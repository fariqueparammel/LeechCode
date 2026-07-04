import type { PromptFile } from "./types";

export interface CompactionPromptInput {
  readonly recentAssistantText: string;
  readonly files: readonly PromptFile[];
}

export function buildCompactionPrompt(input: CompactionPromptInput): string {
  const fileList = input.files.map((file) => `- ${file.path}`).join("\n") || "- No files attached";

  return [
    "<webchat_compaction_request>",
    "Create a compact development state for continuing this coding task in a fresh chat.",
    "Include only durable facts that help the next assistant continue accurately.",
    "",
    "<required_sections>",
    "- Objective",
    "- Current status",
    "- Decisions made",
    "- Files changed or inspected",
    "- Constraints and user preferences",
    "- Next actions",
    "- Known errors or failing checks",
    "</required_sections>",
    "",
    "<files_in_context>",
    fileList,
    "</files_in_context>",
    "",
    "<recent_assistant_text>",
    input.recentAssistantText,
    "</recent_assistant_text>",
    "</webchat_compaction_request>"
  ].join("\n");
}

