import type { HostToWebview, WebviewToHost } from "../src/webview/messages";

interface VsCodeApi {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

const api = acquireVsCodeApi();

export function post(message: WebviewToHost): void {
  api.postMessage(message);
}

export function onHostMessage(handler: (message: HostToWebview) => void): () => void {
  const listener = (event: MessageEvent) => handler(event.data as HostToWebview);
  window.addEventListener("message", listener);
  return () => window.removeEventListener("message", listener);
}

export function uuid(): string {
  return globalThis.crypto?.randomUUID?.() ?? `id-${Math.floor(Math.random() * 1e9)}`;
}
