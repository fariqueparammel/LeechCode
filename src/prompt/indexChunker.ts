// Splits a whole-codebase index into an ordered sequence of paste-safe messages.
//
// Web AI chat inputs cap how much text you can paste/submit in one message, so a large codebase
// can't be delivered in a single prompt. This module packs the project's files into N ordered
// "priming" messages, each under the provider's per-message character limit. Large files are split
// across consecutive messages with explicit `part="k/n"` markers so the model can reassemble them.
// The controller sends these messages one at a time (waiting for the model to acknowledge each)
// before finally sending the real task.
//
// Pure and vscode-free so it can be unit-tested directly.

import type { PromptFile } from "./types";
import { escapeXml, wrapCdata } from "./buildPrompt";

export interface IndexChunkFileRef {
  readonly path: string;
  /** 1-based part number of this file within the whole index (1/1 when not split). */
  readonly part: number;
  readonly parts: number;
  /** Characters of file content carried in this slice. */
  readonly bytes: number;
}

export interface IndexChunk {
  /** 1-based position of this message in the delivery sequence. */
  readonly index: number;
  readonly total: number;
  /** Length of `text` in characters. */
  readonly chars: number;
  /** The full message to paste into the chat input. */
  readonly text: string;
  readonly files: readonly IndexChunkFileRef[];
}

export interface PlanIndexChunksOptions {
  /** Hard per-message character ceiling (the provider's paste-safe input limit). */
  readonly maxChars: number;
  /** Total characters of file content allowed across the whole index (session/conversation cap). */
  readonly maxSessionChars?: number;
  /** Safety cap on the number of delivery messages; excess files are dropped. */
  readonly maxChunks?: number;
  readonly providerLabel?: string;
}

export interface IndexPlan {
  readonly chunks: readonly IndexChunk[];
  /** Number of source files (excluding the always-first file tree) fully included. */
  readonly includedFiles: number;
  /** Paths dropped because of the session cap or the max-chunk cap. */
  readonly droppedFiles: readonly string[];
  /** Total characters of file content actually delivered. */
  readonly contentChars: number;
}

// Reserve for the per-message framing (instructions + <files> wrapper). The per-file list line is
// charged against each segment separately (see SEGMENT_LIST_OVERHEAD) so this stays a small fixed
// constant regardless of how many files land in a chunk.
const FRAMING_RESERVE = 900;
const SEGMENT_LIST_OVERHEAD = 24; // "- <path> (part k/n)\n"
const DEFAULT_MAX_CHUNKS = 80;

interface Segment {
  readonly ref: IndexChunkFileRef;
  readonly text: string;
  /** Packing cost: block length + its line in the per-message file list. */
  readonly cost: number;
}

/**
 * Plan the ordered delivery messages for a codebase index. `files` are delivered in the given order
 * (callers typically put a WORKSPACE_FILE_TREE.txt pseudo-file first). Returns at least one chunk
 * as long as there is any deliverable content.
 */
export function planIndexChunks(files: readonly PromptFile[], options: PlanIndexChunksOptions): IndexPlan {
  const maxChars = Math.max(1200, Math.trunc(options.maxChars) || 0);
  const maxChunks = Math.max(1, options.maxChunks ?? DEFAULT_MAX_CHUNKS);
  const contentBudget = Math.max(600, maxChars - FRAMING_RESERVE);

  // 1) Apply the session cap up front by keeping whole files (in order) until the content budget
  //    is spent. Predictable and independent of how files later pack into messages.
  const droppedFiles: string[] = [];
  const kept: PromptFile[] = [];
  let contentChars = 0;
  const sessionCap = options.maxSessionChars && options.maxSessionChars > 0 ? options.maxSessionChars : Infinity;
  for (const file of files) {
    if (kept.length > 0 && contentChars + file.content.length > sessionCap) {
      droppedFiles.push(file.path);
      continue;
    }
    kept.push(file);
    contentChars += file.content.length;
  }

  // 2) Turn each file into one or more formatted <file> segments, splitting large files so every
  //    segment's block fits inside a single message's content budget.
  const segments: Segment[] = [];
  for (const file of kept) {
    const overhead = fileWrapperOverhead(file.path);
    if (file.content.length + overhead <= contentBudget) {
      segments.push(makeSegment(file.path, file.languageId, file.content, 1, 1));
      continue;
    }
    const sliceBudget = Math.max(400, contentBudget - overhead);
    const slices = splitContent(file.content, sliceBudget);
    slices.forEach((slice, i) => {
      segments.push(makeSegment(file.path, file.languageId, slice, i + 1, slices.length));
    });
  }

  // 3) Greedily pack segments into chunks under the content budget (each segment already fits).
  const grouped: Segment[][] = [];
  let current: Segment[] = [];
  let currentCost = 0;
  for (const segment of segments) {
    if (current.length > 0 && currentCost + segment.cost > contentBudget) {
      grouped.push(current);
      current = [];
      currentCost = 0;
    }
    current.push(segment);
    currentCost += segment.cost;
  }
  if (current.length > 0) {
    grouped.push(current);
  }

  // 4) Enforce the max-chunk cap; anything past it is dropped (reported to the caller).
  let usedGroups = grouped;
  if (grouped.length > maxChunks) {
    usedGroups = grouped.slice(0, maxChunks);
    for (const group of grouped.slice(maxChunks)) {
      for (const segment of group) {
        if (!droppedFiles.includes(segment.ref.path)) {
          droppedFiles.push(segment.ref.path);
        }
      }
    }
  }

  // 5) Render each message with framing that references its position in the sequence.
  const total = usedGroups.length;
  const chunks: IndexChunk[] = usedGroups.map((group, i) => {
    const index = i + 1;
    const text = renderChunk(index, total, group, options.providerLabel);
    return {
      index,
      total,
      chars: text.length,
      text,
      files: group.map((segment) => segment.ref)
    };
  });

  const deliveredContent = chunks.reduce(
    (sum, chunk) => sum + chunk.files.reduce((s, f) => s + f.bytes, 0),
    0
  );
  const includedPaths = new Set(chunks.flatMap((chunk) => chunk.files.map((f) => f.path)));

  return {
    chunks,
    includedFiles: includedPaths.size,
    droppedFiles,
    contentChars: deliveredContent
  };
}

/** Split content into ordered slices whose lengths never exceed `budget`; slices.join("") === content. */
export function splitContent(content: string, budget: number): string[] {
  const size = Math.max(1, Math.trunc(budget));
  if (content.length <= size) {
    return [content];
  }
  const slices: string[] = [];
  for (let offset = 0; offset < content.length; offset += size) {
    slices.push(content.slice(offset, offset + size));
  }
  return slices;
}

function makeSegment(
  path: string,
  languageId: string | undefined,
  content: string,
  part: number,
  parts: number
): Segment {
  const text = formatFileBlock(path, languageId, content, part, parts);
  return {
    ref: { path, part, parts, bytes: content.length },
    text,
    cost: text.length + path.length + SEGMENT_LIST_OVERHEAD
  };
}

/** A `<file>` block, tagged with part info when the file is split across messages. */
function formatFileBlock(
  path: string,
  languageId: string | undefined,
  content: string,
  part: number,
  parts: number
): string {
  const language = languageId ? ` language="${escapeXml(languageId)}"` : "";
  const partAttr = parts > 1 ? ` part="${part}" of="${parts}"` : "";
  const continues = parts > 1 && part < parts ? "\n<!-- large file: continued in the next message -->" : "";
  const resumes = parts > 1 && part > 1 ? "<!-- ...continued from the previous message -->\n" : "";
  return [
    `<file path="${escapeXml(path)}"${language}${partAttr}>`,
    `${resumes}${wrapCdata(content)}${continues}`,
    "</file>"
  ].join("\n");
}

/** Length of a file block's fixed wrapper (tags + CDATA markers), excluding the content itself. */
function fileWrapperOverhead(path: string): number {
  // `<file path="...">` + `\n<![CDATA[\n` + `\n]]>\n` + `</file>` + part/comment slack.
  return path.length + 120;
}

function renderChunk(index: number, total: number, group: readonly Segment[], providerLabel?: string): string {
  const target = providerLabel ? ` (${providerLabel})` : "";
  const fileList = group
    .map((segment) => {
      const partNote = segment.ref.parts > 1 ? ` (part ${segment.ref.part}/${segment.ref.parts})` : "";
      return `- ${segment.ref.path}${partNote}`;
    })
    .join("\n");
  const body = group.map((segment) => segment.text).join("\n\n");

  return [
    `<webchat_codebase_index part="${index}" of="${total}">`,
    `INSTRUCTIONS: This is message ${index} of ${total} delivering this project's source files as` +
      ` context${target}, because the codebase is too large to paste in one message.`,
    "Do NOT write code, make edits, or emit a <webchat_agent_response> block yet.",
    "Read and remember these files. A file tagged part=\"k/n\" is large and split across messages —" +
      " concatenate its parts in order to reconstruct it.",
    `After message ${total} you will receive the actual task in a follow-up message; only then should you act.`,
    `Reply now with exactly: ACK ${index}/${total}`,
    "Files in this message:",
    fileList,
    "<files>",
    body,
    "</files>",
    "</webchat_codebase_index>"
  ].join("\n");
}

/**
 * The note prepended to the real task prompt after all index messages have been delivered, so the
 * model knows the preceding messages were context and that it should now act.
 */
export function buildIndexPrimedNote(chunkCount: number): string {
  return (
    `This project's codebase was delivered to you across the previous ${chunkCount} message` +
    `${chunkCount === 1 ? "" : "s"} (a codebase index). Use those files as context. This is the FINAL` +
    " message with the actual task — perform it now and reply with the WebChat agent response block as instructed."
  );
}
