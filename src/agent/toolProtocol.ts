import { extractAgentJson } from "./responseFormat";

export interface AgentFileChange {
  readonly path: string;
  readonly action: "write" | "delete";
  readonly content?: string;
}

/**
 * A structured tool the model can ask the IDE to run. Read-only tools (read_file/list_dir/search)
 * are executed automatically and safely (workspace-scoped, capped); `run` is a shell command gated
 * by the agent mode. Results are fed back to the chat as the next message, forming the tool loop.
 */
export type AgentToolRequest =
  | { readonly name: "read_file"; readonly path: string; readonly startLine?: number; readonly endLine?: number }
  | { readonly name: "list_dir"; readonly path: string }
  | { readonly name: "search"; readonly query: string; readonly glob?: string }
  | { readonly name: "run"; readonly command: string }
  | { readonly name: "spawn_subagent"; readonly task: string; readonly context?: readonly string[] };

export type AgentToolName = AgentToolRequest["name"];

export interface AgentResponse {
  readonly summary: string;
  readonly files: readonly AgentFileChange[];
  readonly commands: readonly string[];
  readonly tools: readonly AgentToolRequest[];
  readonly nextSteps: readonly string[];
}

const START_MARKER = "<webchat_agent_response>";
const END_MARKER = "</webchat_agent_response>";
const MAX_REPAIR_CONTEXT_CHARS = 12000;

export function buildAgentToolInstructions(input: {
  readonly maxContextTokens: number;
  readonly compactEveryPrompts: number;
  readonly action: "continue" | "compact" | "rotate";
  readonly mode?: "ask" | "auto" | "plan" | "bypass";
  readonly previousSummary?: string;
  /** When false (inside a subagent), the spawn_subagent tool is not advertised (depth cap). */
  readonly allowSubagents?: boolean;
  /** Provider the prompt is sent to — adds provider-specific format guidance (e.g. Gemini). */
  readonly providerId?: string;
}): string {
  const previousSummary = input.previousSummary
    ? `\nPrevious compacted session state:\n${input.previousSummary}\n`
    : "";
  const mode = input.mode ?? "ask";
  const autoEdits = mode === "auto" || mode === "bypass";

  // The agent mode manipulates what we ask the model to produce.
  const modeInstruction =
    mode === "plan"
      ? "MODE: PLAN. Do NOT write or change any files this turn. Respond with a concise, numbered implementation plan in `summary` and `nextSteps`, and return an empty `files` array. The user will switch to an edit mode to apply it."
      : autoEdits
        ? "MODE: AUTO-EDIT. Make the complete edits needed to fully satisfy the task and return them as file writes. The IDE applies them automatically, so include every file required to run."
        : "MODE: ASK. Propose the complete edits as file writes. The user will review a diff and approve before anything is applied, so make the changes self-contained and easy to review.";

  const allowSubagents = input.allowSubagents ?? true;
  const toolsDoc =
    mode === "plan"
      ? "You may READ to plan (read_file, list_dir, search) but must NOT run shell commands or edit files this turn."
      : [
          "You have a full coding toolbelt. Request tools in a \"tools\" array; the IDE executes them and sends you their output as the next message so you can read results and continue (a tool loop). Available tools:",
          "  • {\"name\":\"read_file\",\"path\":\"rel/path\"} — read a file (optional \"startLine\"/\"endLine\" for a slice).",
          "  • {\"name\":\"list_dir\",\"path\":\"rel/dir\"} — list a directory's entries.",
          "  • {\"name\":\"search\",\"query\":\"regex or text\",\"glob\":\"**/*.ts\"} — search file contents (glob optional).",
          "  • {\"name\":\"run\",\"command\":\"npm test\"} — run ANY shell command in the workspace root: git (e.g. `git diff`, `git status`), build, run, tests, linters (eslint), formatters (prettier), package managers, etc.",
          allowSubagents
            ? "  • {\"name\":\"spawn_subagent\",\"task\":\"self-contained instruction\",\"context\":[\"rel/path\"]} — delegate a focused sub-task to a fresh isolated agent that only sees the task + the files you list. It runs its own tool loop and returns a concise result summary to you. Use it to parallelize/scope large work; a subagent cannot itself spawn subagents."
            : "",
          `Read-only tools (read_file/list_dir/search) run automatically. \`run\` commands${allowSubagents ? " and spawn_subagent are" : " are"} approved per agent mode. The legacy "commands":["…"] array is still accepted and equals a list of run tools.`,
          `Explore with read_file/list_dir/search before editing, verify with \`run\` (build/tests/lint) afterward${allowSubagents ? ", and delegate independent chunks with spawn_subagent" : ""}. Stop requesting tools once the task is done and verified.`
        ]
          .filter(Boolean)
          .join("\n");

  const providerNote =
    input.providerId === "gemini" || input.providerId === "aistudio"
      ? "PLATFORM NOTE (Gemini): reply in plain text/markdown only — no canvas, no tool_code, no code-execution blocks. Put the response block at the END of your reply, after your short explanation."
      : "";

  return [
    "You are driving an IDE through WebChat's coding tools.",
    modeInstruction,
    providerNote,
    // Streaming UX: the IDE hides the JSON block and streams the prose around it to the user live.
    "IMPORTANT: Begin your reply with 1–4 short sentences in plain language explaining what you are about to do and why. This prose streams live to the developer, so never start with the JSON block and never leave the prose empty. After the explanation, output the single marked block below.",
    toolsDoc,
    "Return edits and tool requests only through the exact JSON block shown below. Prefer the plain <webchat_agent_response> markers with no markdown fences; if your platform forces code formatting, a ```json fenced block containing the same JSON object is also accepted. Never HTML-escape the markers and never put them inside backticks.",
    "Request tools ONLY via the \"tools\" array in that JSON. Do NOT emit tool_code / python / function-call code blocks — the IDE does not execute those.",
    "Use workspace-relative paths only. Never use absolute paths or parent-directory traversal.",
    "A PROJECT_STRUCTURE.txt listing the repository's files is included so you know the layout. Before editing an EXISTING file, first read_file it and modify its ACTUAL current content — never rewrite a file you have not read, or you will lose existing content. Writes replace the whole file.",
    "For each complete file you want changed, use {\"path\":\"relative/path\",\"action\":\"write\",\"contentBase64\":\"UTF-8 base64 full file contents\"}.",
    "Prefer contentBase64 for every write. The IDE also accepts content for tiny plain-text files, but raw code strings are easy to make invalid JSON.",
    "The marked block must be valid JSON that can be parsed with JSON.parse.",
    "For deletions, use {\"path\":\"relative/path\",\"action\":\"delete\"}.",
    `Current session action: ${input.action}.`,
    `Configured total context limit: ${input.maxContextTokens} approximate tokens.`,
    `Compaction cadence: every ${input.compactEveryPrompts} prompts.`,
    input.action === "compact"
      ? "This turn must compact the current development state in summary and include no file edits unless essential."
      : "",
    input.action === "rotate"
      ? "This turn is for a fresh chat session. Start from the previous summary, then continue the work."
      : "",
    previousSummary,
    "Required response shape (prose first, then this block):",
    START_MARKER,
    "{",
    "  \"summary\": \"short durable plan/state for future chats\",",
    "  \"files\": [",
    "    {\"path\":\"demo/example/index.html\",\"action\":\"write\",\"contentBase64\":\"PG1haW4+SGVsbG88L21haW4+\"}",
    "  ],",
    "  \"tools\": [{\"name\":\"read_file\",\"path\":\"src/app.ts\"}, {\"name\":\"run\",\"command\":\"npm test\"}],",
    "  \"nextSteps\": [\"short next step\"]",
    "}",
    END_MARKER
  ].filter(Boolean).join("\n");
}

export function parseAgentResponse(text: string): AgentResponse | undefined {
  const rawJson = extractMarkedJson(text);

  if (!rawJson) {
    return undefined;
  }

  const parsed = JSON.parse(rawJson) as unknown;

  if (!isRecord(parsed)) {
    throw new Error("Agent response must be a JSON object.");
  }

  const summary = readString(parsed, "summary", "");
  const files = readFileChanges(parsed.files);
  const commands = readCommands(parsed.commands);
  const tools = readToolRequests(parsed.tools, commands);
  const nextSteps = readNextSteps(parsed.nextSteps);

  return {
    summary,
    files,
    commands,
    tools,
    nextSteps
  };
}

/**
 * Parse the structured `tools` array, plus fold any legacy `commands` strings in as `run` tools so
 * the controller has one ordered list to execute. Unknown/invalid tool entries are dropped.
 */
function readToolRequests(value: unknown, commands: readonly string[]): AgentToolRequest[] {
  const tools: AgentToolRequest[] = [];

  if (Array.isArray(value)) {
    for (const item of value) {
      const tool = readToolRequest(item);
      if (tool) {
        tools.push(tool);
      }
    }
  }

  // Legacy: a bare "commands" array is equivalent to a list of run tools. Only fold them in if the
  // model didn't already express them as run tools (avoid double-running the same command).
  const alreadyRunning = new Set(
    tools.filter((t): t is Extract<AgentToolRequest, { name: "run" }> => t.name === "run").map((t) => t.command)
  );
  for (const command of commands) {
    if (!alreadyRunning.has(command)) {
      tools.push({ name: "run", command });
    }
  }

  return tools;
}

function readToolRequest(item: unknown): AgentToolRequest | undefined {
  if (!isRecord(item) || typeof item.name !== "string") {
    return undefined;
  }
  switch (item.name) {
    case "read_file": {
      if (typeof item.path !== "string" || !item.path.trim()) {
        return undefined;
      }
      const startLine = toPositiveInt(item.startLine);
      const endLine = toPositiveInt(item.endLine);
      return { name: "read_file", path: item.path.trim(), startLine, endLine };
    }
    case "list_dir":
      return typeof item.path === "string" ? { name: "list_dir", path: item.path.trim() } : undefined;
    case "search": {
      if (typeof item.query !== "string" || !item.query.trim()) {
        return undefined;
      }
      const glob = typeof item.glob === "string" && item.glob.trim() ? item.glob.trim() : undefined;
      return { name: "search", query: item.query, glob };
    }
    case "run":
      return typeof item.command === "string" && item.command.trim()
        ? { name: "run", command: item.command.trim() }
        : undefined;
    case "spawn_subagent": {
      if (typeof item.task !== "string" || !item.task.trim()) {
        return undefined;
      }
      const context = Array.isArray(item.context)
        ? item.context.filter((p): p is string => typeof p === "string" && p.trim().length > 0).map((p) => p.trim())
        : undefined;
      return { name: "spawn_subagent", task: item.task.trim(), context };
    }
    default:
      return undefined;
  }
}

function toPositiveInt(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.trunc(value) : undefined;
}

function readCommands(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      .map((item) => item.trim());
  }
  if (typeof value === "string" && value.trim().length > 0) {
    return [value.trim()];
  }
  return [];
}

export function buildAgentResponseRepairPrompt(input: {
  readonly parseError: string;
  readonly invalidResponse: string;
}): string {
  return [
    "Your previous WebChat agent tool response could not be parsed by the IDE.",
    `Parser error: ${input.parseError}`,
    "",
    "Return only a corrected WebChat agent response block (a ```json fenced block with the same JSON is also accepted).",
    "The block must be valid JSON parseable by JSON.parse.",
    "For every write, use contentBase64 with UTF-8 base64 file contents. Do not use raw content strings for code.",
    "Use this exact shape:",
    START_MARKER,
    "{",
    "  \"summary\": \"short durable plan/state for future chats\",",
    "  \"files\": [",
    "    {\"path\":\"demo/example/index.html\",\"action\":\"write\",\"contentBase64\":\"PG1haW4+SGVsbG88L21haW4+\"}",
    "  ],",
    "  \"nextSteps\": [\"short next step\"]",
    "}",
    END_MARKER,
    "",
    "Invalid previous response:",
    truncateForRepair(input.invalidResponse)
  ].join("\n");
}

function extractMarkedJson(text: string): string | undefined {
  // Lenient: prefer the <webchat_agent_response> markers, but also accept a ```json-fenced or bare
  // JSON object of the right shape (models like DeepSeek fence the JSON and drop the markers).
  return extractAgentJson(text);
}

function readFileChanges(value: unknown): AgentFileChange[] {
  const items = Array.isArray(value)
    ? value
    : isRecord(value)
      ? [value]
      : [];

  if (items.length === 0) {
    return [];
  }

  return items.map((item) => {
    if (!isRecord(item)) {
      throw new Error("Each file change must be a JSON object.");
    }

    const path = readString(item, "path");
    const action = item.action;

    if (action !== "write" && action !== "delete") {
      throw new Error(`Unsupported file action for ${path}.`);
    }

    if (action === "write") {
      return {
        path,
        action,
        content: readWriteContent(item)
      };
    }

    return {
      path,
      action
    };
  });
}

function readNextSteps(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((step): step is string => typeof step === "string");
  }

  if (typeof value === "string" && value.trim()) {
    return [value];
  }

  return [];
}

function readWriteContent(value: Record<string, unknown>): string {
  const encoded = value.contentBase64;

  if (typeof encoded === "string") {
    return Buffer.from(encoded, "base64").toString("utf8");
  }

  return readString(value, "content");
}

function truncateForRepair(text: string): string {
  if (text.length <= MAX_REPAIR_CONTEXT_CHARS) {
    return text;
  }

  const head = text.slice(0, Math.floor(MAX_REPAIR_CONTEXT_CHARS / 2));
  const tail = text.slice(-Math.floor(MAX_REPAIR_CONTEXT_CHARS / 2));
  return `${head}\n\n...[truncated for repair prompt]...\n\n${tail}`;
}

function readString(value: Record<string, unknown>, property: string, fallback?: string): string {
  const field = value[property];

  if (typeof field === "string") {
    return field;
  }

  if (fallback !== undefined) {
    return fallback;
  }

  throw new Error(`Agent response requires a ${property} string.`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
