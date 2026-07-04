import * as vscode from "vscode";
import { WebChatController } from "./webchat/controller";
import { WebChatViewProvider } from "./webview/panelProvider";
import { buildPrompt } from "./prompt/buildPrompt";
import { collectActiveEditorContext } from "./workspace/context";

let controller: WebChatController | undefined;

export function activate(context: vscode.ExtensionContext): void {
  controller = new WebChatController(context);
  const provider = new WebChatViewProvider(context, controller);

  context.subscriptions.push(
    controller,
    vscode.window.registerWebviewViewProvider(WebChatViewProvider.viewId, provider, {
      webviewOptions: { retainContextWhenHidden: true }
    }),
    vscode.commands.registerCommand("webchat.focusChat", () => provider.reveal("chat")),
    vscode.commands.registerCommand("webchat.openSettings", () => provider.reveal("settings")),
    vscode.commands.registerCommand("webchat.startBridge", () => controller?.startBridge(false)),
    vscode.commands.registerCommand("webchat.showBridgeStatus", showBridgeStatus),
    vscode.commands.registerCommand("webchat.openProvider", () => controller?.openExternalProvider()),
    vscode.commands.registerCommand("webchat.sendPromptToBrowser", async () => {
      await provider.reveal("chat");
      await controller?.dispatchPrompt();
    }),
    vscode.commands.registerCommand("webchat.runAgentTask", () => runAgentTask(provider)),
    vscode.commands.registerCommand("webchat.copyPrompt", () => controller?.copyPrompt()),
    vscode.commands.registerCommand("webchat.copyContext", copyContext),
    vscode.commands.registerCommand("webchat.showSessionStatus", showSessionStatus),
    vscode.commands.registerCommand("webchat.configureSessionBudget", () => provider.reveal("settings")),
    vscode.commands.registerCommand("webchat.resetSession", () => controller?.resetSession()),
    vscode.commands.registerCommand("webchat.compactSessionNow", async () => {
      await provider.reveal("chat");
      await controller?.compactNow();
    }),
    vscode.commands.registerCommand("webchat.rotateSessionNow", async () => {
      await provider.reveal("chat");
      await controller?.rotateNow();
    })
  );

  void controller.startBridge(true);
}

export function deactivate(): void {
  controller?.dispose();
  controller = undefined;
}

async function runAgentTask(provider: WebChatViewProvider): Promise<void> {
  const instruction = await vscode.window.showInputBox({
    title: "WebChat Agent Task",
    prompt: "Describe what the web chat should build or change in this workspace.",
    placeHolder: "Build a small landing page in demo/my-app..."
  });

  if (!instruction?.trim()) {
    return;
  }

  await provider.reveal("chat");
  await controller?.dispatchPrompt(instruction.trim());
}

async function copyContext(): Promise<void> {
  const includeSelectionOnly = vscode.workspace
    .getConfiguration("webchat")
    .get<boolean>("prompt.includeSelectionOnly", false);
  const context = await collectActiveEditorContext(includeSelectionOnly);

  if (context.files.length === 0) {
    await vscode.window.showWarningMessage("No active editor context found.");
    return;
  }

  await vscode.env.clipboard.writeText(
    buildPrompt({ instruction: "Editor context only.", files: context.files })
  );
  await vscode.window.showInformationMessage("Current file context copied.");
}

async function showBridgeStatus(): Promise<void> {
  const status = controller?.getBridgeStatus();
  if (!status?.running) {
    await vscode.window.showWarningMessage("WebChat bridge is not running.");
    return;
  }
  await vscode.window.showInformationMessage("WebChat browser bridge status", {
    modal: true,
    detail: [`Port: ${status.port}`, `Connected browser clients: ${status.clientCount}`].join("\n")
  });
}

async function showSessionStatus(): Promise<void> {
  const usage = controller?.getUsageInfo();
  if (!usage) {
    return;
  }
  await vscode.window.showInformationMessage("WebChat session status", {
    modal: true,
    detail: [
      `Prompts sent: ${usage.promptCount}`,
      `Approx total context tokens: ${usage.totalTokensUsed} / ${usage.maxContextTokens}`,
      `Approx input tokens: ${usage.inputTokensUsed} / ${usage.maxInputTokens}`,
      `Approx output tokens: ${usage.outputTokensUsed} / ${usage.maxOutputTokens}`,
      `Next action: ${usage.nextAction}`
    ].join("\n")
  });
}
