import * as vscode from "vscode";
import { randomBytes } from "crypto";
import type { WebChatController } from "../webchat/controller";
import type { HostToWebview, WebviewToHost } from "./messages";

export class WebChatViewProvider implements vscode.WebviewViewProvider {
  static readonly viewId = "webchat.chatView";

  private view: vscode.WebviewView | undefined;
  private readonly subscriptions: vscode.Disposable[] = [];

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly controller: WebChatController
  ) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    this.controller.webviewConnected = true;

    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, "dist", "webview")]
    };
    view.webview.html = this.renderHtml(view.webview);

    view.webview.onDidReceiveMessage((message: WebviewToHost) => this.handleMessage(message));

    // Mirror controller events into the webview.
    this.subscriptions.push(
      this.controller.onStatus((bridge) => this.post({ type: "bridgeStatus", bridge })),
      this.controller.onContext((context) => this.post({ type: "context", context })),
      this.controller.onSettings((settings) => this.post({ type: "settings", settings })),
      this.controller.onUsage((usage) => this.post({ type: "sessionUsage", usage })),
      this.controller.onDispatched((info) =>
        this.post({
          type: "promptDispatched",
          turnId: info.turnId,
          instruction: info.instruction,
          action: info.action,
          clientCount: info.clientCount,
          promptTokens: info.promptTokens
        })
      ),
      this.controller.onStreamDelta((delta) =>
        this.post({ type: "streamDelta", turnId: delta.turnId, text: delta.text, fullText: delta.fullText })
      ),
      this.controller.onStreamDone((done) =>
        this.post({ type: "streamDone", turnId: done.turnId, displayText: done.displayText, responseTokens: done.responseTokens })
      ),
      this.controller.onCancelled((info) => this.post({ type: "promptCancelled", turnId: info.turnId })),
      this.controller.onSessions((sessions) => this.post({ type: "sessions", sessions })),
      this.controller.onAssistantParsed((parsed) =>
        this.post({
          type: "assistantParsed",
          turnId: parsed.turnId,
          summary: parsed.summary,
          files: parsed.files,
          commands: parsed.commands,
          nextSteps: parsed.nextSteps
        })
      ),
      this.controller.onApplyResult((result) =>
        this.post({ type: "applyResult", applied: result.applied, error: result.error })
      ),
      this.controller.onCommandOutput((out) =>
        this.post({ type: "commandOutput", command: out.command, output: out.output, exitCode: out.exitCode })
      ),
      this.controller.onNotice((notice) =>
        this.post({ type: "notice", level: notice.level, message: notice.message })
      )
    );

    view.onDidDispose(() => {
      this.controller.webviewConnected = false;
      for (const subscription of this.subscriptions.splice(0)) {
        subscription.dispose();
      }
      this.view = undefined;
    });
  }

  async reveal(view: "chat" | "settings" = "chat"): Promise<void> {
    await vscode.commands.executeCommand("webchat.chatView.focus");
    this.post({ type: "navigate", view });
  }

  private async handleMessage(message: WebviewToHost): Promise<void> {
    switch (message.type) {
      case "ready":
        this.post({ type: "init", ...this.controller.getInitState() });
        await this.controller.startBridge(true);
        return;
      case "sendPrompt":
        await this.controller.dispatchPrompt(message.text, undefined, message.contextPaths, true, message.attachments);
        return;
      case "requestFiles": {
        const files = await this.controller.listWorkspaceFiles(message.query);
        this.post({ type: "fileList", query: message.query, files });
        return;
      }
      case "switchProvider":
        await this.controller.setProvider(message.providerId);
        this.post({ type: "settings", settings: this.controller.getSettings() });
        return;
      case "openExternalProvider":
        await this.controller.openExternalProvider();
        return;
      case "launchBrowser":
        await this.controller.launchBrowser();
        return;
      case "closeBrowser":
        await this.controller.closeBrowser();
        return;
      case "startBridge":
        await this.controller.startBridge(false);
        return;
      case "sessionAction":
        if (message.action === "compact") {
          await this.controller.compactNow();
        } else if (message.action === "rotate") {
          await this.controller.rotateNow();
        } else {
          await this.controller.resetSession();
        }
        return;
      case "applyChanges":
        await this.controller.applyChanges(message.turnId);
        return;
      case "previewChanges":
        await this.controller.previewChanges(message.turnId, message.path);
        return;
      case "skipChanges":
        this.controller.skipChanges();
        return;
      case "runCommands":
        await this.controller.runCommands(message.turnId);
        return;
      case "skipCommands":
        this.controller.skipCommands();
        return;
      case "cancelPrompt":
        await this.controller.cancelPrompt(message.turnId);
        return;
      case "setModel":
        this.controller.setModel(message.model);
        return;
      case "setProviderModels":
        await this.controller.setProviderModels(message.providerId, message.models);
        // Refresh the webview's provider list so the switcher + editor reflect the change at once.
        this.post({ type: "providers", providers: this.controller.getProvidersInfo() });
        return;
      case "toggleFeature":
        this.controller.toggleFeature(message.featureId);
        return;
      case "openChatUrl":
        await this.controller.openChatUrl(message.url);
        return;
      case "removeSession":
        this.controller.removeSession(message.url);
        return;
      case "clearSessions":
        this.controller.clearSessions();
        return;
      case "retryLast":
        await this.controller.retryLast();
        return;
      case "updateSetting":
        await this.controller.updateSetting(message.key, message.value);
        this.post({ type: "settings", settings: this.controller.getSettings() });
        this.post({ type: "sessionUsage", usage: this.controller.getUsageInfo() });
        return;
    }
  }

  private post(message: HostToWebview): void {
    void this.view?.webview.postMessage(message);
  }

  private renderHtml(webview: vscode.Webview): string {
    const nonce = randomBytes(16).toString("base64");
    const base = vscode.Uri.joinPath(this.context.extensionUri, "dist", "webview");
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(base, "main.js"));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(base, "main.css"));
    const csp = [
      `default-src 'none'`,
      `img-src ${webview.cspSource} https: data:`,
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `font-src ${webview.cspSource}`,
      `script-src 'nonce-${nonce}'`
    ].join("; ");

    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="Content-Security-Policy" content="${csp}" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="stylesheet" href="${styleUri}" />
    <title>LeechCode</title>
  </head>
  <body>
    <div id="root"></div>
    <script nonce="${nonce}" src="${scriptUri}"></script>
  </body>
</html>`;
  }
}
