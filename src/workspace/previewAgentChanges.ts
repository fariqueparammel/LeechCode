import * as path from "path";
import * as vscode from "vscode";
import type { AgentFileChange } from "../agent/toolProtocol";
import { getWorkspaceRoot, resolveWorkspacePath, type AppliedAgentChange } from "./applyAgentChanges";

const MAX_DIFF_PREVIEWS = 8;

/**
 * Open before→after diffs for changes that were just APPLIED (using the pre-edit snapshots), so the
 * developer sees exactly what each edit did — the workspace file already holds the new content.
 */
export async function openAppliedDiffs(
  applied: readonly AppliedAgentChange[],
  context: vscode.ExtensionContext,
  filterPath?: string
): Promise<number> {
  const emptyRoot = vscode.Uri.joinPath(context.globalStorageUri, "applied-empty");
  await vscode.workspace.fs.createDirectory(emptyRoot);
  let opened = 0;

  for (const change of applied) {
    if (filterPath && change.path !== filterPath) {
      continue;
    }
    if (opened >= MAX_DIFF_PREVIEWS) {
      break;
    }
    if (change.action === "delete") {
      const empty = vscode.Uri.joinPath(emptyRoot, ...splitPath(change.path));
      await ensureParentDirectory(empty);
      await vscode.workspace.fs.writeFile(empty, new Uint8Array());
      await vscode.commands.executeCommand(
        "vscode.diff",
        change.originalUri,
        empty,
        `WebChat applied (deleted): ${change.path}`
      );
      opened += 1;
      continue;
    }
    if (change.currentUri) {
      await vscode.commands.executeCommand(
        "vscode.diff",
        change.originalUri,
        change.currentUri,
        `WebChat applied${change.existedBefore ? "" : " (new)"}: ${change.path}`
      );
      opened += 1;
    }
  }

  return opened;
}

export async function previewAgentFileChanges(
  changes: readonly AgentFileChange[],
  context: vscode.ExtensionContext
): Promise<number> {
  const root = getWorkspaceRoot();
  const previewRoot = vscode.Uri.joinPath(
    context.globalStorageUri,
    "previews",
    String(Date.now())
  );
  const emptyRoot = vscode.Uri.joinPath(previewRoot, "__empty__");
  let opened = 0;

  await vscode.workspace.fs.createDirectory(previewRoot);

  for (const change of changes.slice(0, MAX_DIFF_PREVIEWS)) {
    const target = resolveWorkspacePath(root, change.path);
    const preview = vscode.Uri.joinPath(previewRoot, ...splitPath(change.path));
    const empty = vscode.Uri.joinPath(emptyRoot, ...splitPath(change.path));
    await ensureParentDirectory(preview);
    await ensureParentDirectory(empty);

    if (change.action === "delete") {
      await vscode.workspace.fs.writeFile(empty, new Uint8Array());
      await vscode.commands.executeCommand(
        "vscode.diff",
        await uriOrEmpty(target, empty),
        empty,
        `WebChat delete preview: ${change.path}`
      );
      opened += 1;
      continue;
    }

    await vscode.workspace.fs.writeFile(preview, Buffer.from(change.content || "", "utf8"));
    await vscode.workspace.fs.writeFile(empty, new Uint8Array());
    await vscode.commands.executeCommand(
      "vscode.diff",
      await uriOrEmpty(target, empty),
      preview,
      `WebChat write preview: ${change.path}`
    );
    opened += 1;
  }

  return opened;
}

function splitPath(relativePath: string): string[] {
  return path.normalize(relativePath).replaceAll("\\", "/").split("/").filter(Boolean);
}

async function uriOrEmpty(target: vscode.Uri, empty: vscode.Uri): Promise<vscode.Uri> {
  try {
    await vscode.workspace.fs.stat(target);
    return target;
  } catch {
    return empty;
  }
}

async function ensureParentDirectory(target: vscode.Uri): Promise<void> {
  await vscode.workspace.fs.createDirectory(vscode.Uri.file(path.dirname(target.fsPath)));
}
