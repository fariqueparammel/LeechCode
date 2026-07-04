import * as path from "path";
import * as vscode from "vscode";
import type { PromptFile } from "../prompt/types";

export interface CollectedContext {
  readonly files: readonly PromptFile[];
}

export async function collectActiveEditorContext(selectionOnly: boolean): Promise<CollectedContext> {
  const editor = vscode.window.activeTextEditor;

  if (!editor) {
    return { files: [] };
  }

  const document = editor.document;
  const content = selectionOnly && !editor.selection.isEmpty
    ? document.getText(editor.selection)
    : document.getText();

  return {
    files: [
      {
        path: getWorkspaceRelativePath(document.uri),
        languageId: document.languageId,
        content
      }
    ]
  };
}

function getWorkspaceRelativePath(uri: vscode.Uri): string {
  const folder = vscode.workspace.getWorkspaceFolder(uri);

  if (!folder) {
    return uri.fsPath || uri.toString();
  }

  return path.relative(folder.uri.fsPath, uri.fsPath);
}
