import * as vscode from "vscode";
import type { AgentToolRequest } from "./toolProtocol";
import { getWorkspaceRoot, resolveWorkspacePath } from "../workspace/applyAgentChanges";

const MAX_READ_CHARS = 20000;
const MAX_DIR_ENTRIES = 300;
const MAX_SEARCH_MATCHES = 80;
const MAX_SEARCH_FILES = 400;

export interface ToolExecution {
  /** Human/agent-facing label, e.g. "read_file src/app.ts". */
  readonly label: string;
  /** The tool's textual result to feed back to the chat. */
  readonly output: string;
  readonly ok: boolean;
}

/** Execute a single read-only tool (read_file / list_dir / search) safely within the workspace. */
export async function executeReadonlyTool(tool: AgentToolRequest): Promise<ToolExecution> {
  try {
    switch (tool.name) {
      case "read_file":
        return await readFileTool(tool.path, tool.startLine, tool.endLine);
      case "list_dir":
        return await listDirTool(tool.path);
      case "search":
        return await searchTool(tool.query, tool.glob);
      default:
        return { label: `${tool.name}`, output: `Unsupported read-only tool: ${tool.name}`, ok: false };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { label: describeTool(tool), output: `Error: ${message}`, ok: false };
  }
}

export function describeTool(tool: AgentToolRequest): string {
  switch (tool.name) {
    case "read_file":
      return `read_file ${tool.path}${tool.startLine ? ` (lines ${tool.startLine}-${tool.endLine ?? ""})` : ""}`;
    case "list_dir":
      return `list_dir ${tool.path || "."}`;
    case "search":
      return `search "${tool.query}"${tool.glob ? ` in ${tool.glob}` : ""}`;
    case "run":
      return `run ${tool.command}`;
    case "spawn_subagent":
      return `spawn_subagent: ${tool.task}`;
  }
}

async function readFileTool(path: string, startLine?: number, endLine?: number): Promise<ToolExecution> {
  const root = getWorkspaceRoot();
  const uri = resolveWorkspacePath(root, path);
  const bytes = await vscode.workspace.fs.readFile(uri);
  let content = Buffer.from(bytes).toString("utf8");

  if (startLine || endLine) {
    const lines = content.split("\n");
    const from = Math.max(1, startLine ?? 1);
    const to = Math.min(lines.length, endLine ?? lines.length);
    content = lines.slice(from - 1, to).join("\n");
  }

  const truncated = content.length > MAX_READ_CHARS;
  const body = truncated ? `${content.slice(0, MAX_READ_CHARS)}\n…[truncated ${content.length - MAX_READ_CHARS} chars]` : content;
  return { label: `read_file ${path}`, output: body, ok: true };
}

async function listDirTool(path: string): Promise<ToolExecution> {
  const root = getWorkspaceRoot();
  const uri = path && path !== "." && path !== "./" ? resolveWorkspacePath(root, path) : root.uri;
  const entries = await vscode.workspace.fs.readDirectory(uri);
  const shown = entries.slice(0, MAX_DIR_ENTRIES).map(([name, type]) => {
    const kind = type === vscode.FileType.Directory ? "dir " : type === vscode.FileType.SymbolicLink ? "link" : "file";
    return `${kind}  ${name}`;
  });
  const note = entries.length > MAX_DIR_ENTRIES ? `\n…[${entries.length - MAX_DIR_ENTRIES} more]` : "";
  return { label: `list_dir ${path || "."}`, output: shown.join("\n") + note || "(empty)", ok: true };
}

async function searchTool(query: string, glob?: string): Promise<ToolExecution> {
  const exclude = "{**/node_modules/**,**/.git/**,**/dist/**,**/out/**,**/.next/**,**/*.map,**/*.lock}";
  const uris = await vscode.workspace.findFiles(glob || "**/*", exclude, MAX_SEARCH_FILES);
  let regex: RegExp;
  try {
    regex = new RegExp(query, "i");
  } catch {
    regex = new RegExp(escapeRegExp(query), "i");
  }

  const matches: string[] = [];
  const root = getWorkspaceRoot();
  for (const uri of uris) {
    if (matches.length >= MAX_SEARCH_MATCHES) {
      break;
    }
    let text: string;
    try {
      const bytes = await vscode.workspace.fs.readFile(uri);
      if (bytes.byteLength > 400000) {
        continue;
      }
      text = Buffer.from(bytes).toString("utf8");
      if (/[\x00-\x08]/.test(text)) {
        continue; // binary
      }
    } catch {
      continue;
    }
    const rel = vscode.workspace.asRelativePath(uri, false);
    const lines = text.split("\n");
    for (let i = 0; i < lines.length && matches.length < MAX_SEARCH_MATCHES; i += 1) {
      if (regex.test(lines[i])) {
        matches.push(`${rel}:${i + 1}: ${lines[i].trim().slice(0, 200)}`);
      }
    }
  }

  void root;
  const header = `Search "${query}"${glob ? ` in ${glob}` : ""}: ${matches.length}${matches.length >= MAX_SEARCH_MATCHES ? "+" : ""} match(es)`;
  return { label: `search ${query}`, output: `${header}\n${matches.join("\n") || "(no matches)"}`, ok: true };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
