import * as path from "path";
import * as vscode from "vscode";
import type { AgentFileChange } from "../agent/toolProtocol";

export interface AppliedAgentChange {
  readonly path: string;
  readonly action: AgentFileChange["action"];
  /** Snapshot of the file's content BEFORE the edit (an empty file if it did not exist). */
  readonly originalUri: vscode.Uri;
  /** The workspace file after the edit — the diff's right-hand side. Undefined for deletes. */
  readonly currentUri?: vscode.Uri;
  readonly existedBefore: boolean;
}

/**
 * Apply the model's file changes, snapshotting each file's pre-edit content first so a real
 * before→after diff can be shown after the edit is made (the working file already holds the new
 * content, so a diff against disk would otherwise be empty).
 */
export async function applyAgentFileChanges(
  changes: readonly AgentFileChange[],
  context: vscode.ExtensionContext
): Promise<readonly AppliedAgentChange[]> {
  const root = getWorkspaceRoot();
  const snapshotRoot = vscode.Uri.joinPath(context.globalStorageUri, "applied", String(Date.now()), "before");
  const applied: AppliedAgentChange[] = [];

  for (const change of changes) {
    const target = resolveWorkspacePath(root, change.path);

    // Snapshot the original content (empty if the file is new).
    let existedBefore = true;
    let original: Uint8Array = new Uint8Array();
    try {
      original = await vscode.workspace.fs.readFile(target);
    } catch {
      existedBefore = false;
    }
    const originalUri = vscode.Uri.joinPath(snapshotRoot, ...splitPath(change.path));
    await ensureParentDirectory(originalUri);
    await vscode.workspace.fs.writeFile(originalUri, original);

    if (change.action === "delete") {
      if (existedBefore) {
        await vscode.workspace.fs.delete(target, { recursive: false, useTrash: false });
      }
      applied.push({ path: change.path, action: change.action, originalUri, existedBefore });
      continue;
    }

    await ensureParentDirectory(target);
    await vscode.workspace.fs.writeFile(target, Buffer.from(change.content || "", "utf8"));
    applied.push({ path: change.path, action: change.action, originalUri, currentUri: target, existedBefore });
  }

  return applied;
}

export function getWorkspaceRoot(): vscode.WorkspaceFolder {
  const root = vscode.workspace.workspaceFolders?.[0];

  if (!root) {
    throw new Error("Open a workspace folder before applying WebChat file changes.");
  }

  return root;
}

export function resolveWorkspacePath(root: vscode.WorkspaceFolder, relativePath: string): vscode.Uri {
  const normalized = path.normalize(relativePath).replaceAll("\\", "/");

  if (
    path.isAbsolute(relativePath) ||
    normalized === "." ||
    normalized.startsWith("../") ||
    normalized === ".." ||
    normalized.includes("/../")
  ) {
    throw new Error(`Refusing unsafe workspace path: ${relativePath}`);
  }

  return vscode.Uri.joinPath(root.uri, ...normalized.split("/").filter(Boolean));
}

function splitPath(relativePath: string): string[] {
  return path.normalize(relativePath).replaceAll("\\", "/").split("/").filter(Boolean);
}

async function ensureParentDirectory(target: vscode.Uri): Promise<void> {
  const parentPath = path.dirname(target.fsPath);
  await vscode.workspace.fs.createDirectory(vscode.Uri.file(parentPath));
}
