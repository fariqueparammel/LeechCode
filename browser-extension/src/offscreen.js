const BRIDGE_PORT = 53451;
const BRIDGE_TOKEN = "webchat-dev-token";
const SESSION_ID = "browser-extension";
const RECONNECT_DELAY_MS = 1000;
const HEARTBEAT_MS = 5000;

let websocket;
let reconnectTimer;
let heartbeatTimer;
let pendingEnvelopes = [];

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "webchat.bridge.connect") {
    connectBridge();
    return false;
  }

  if (message?.type === "webchat.bridge.send") {
    sendToBridge(message.envelope);
    return false;
  }

  return false;
});

chrome.runtime.sendMessage({ type: "webchat.offscreen.ready" });
connectBridge();

function connectBridge() {
  if (
    websocket?.readyState === WebSocket.OPEN ||
    websocket?.readyState === WebSocket.CONNECTING
  ) {
    return;
  }

  clearTimeout(reconnectTimer);
  websocket = new WebSocket(`ws://127.0.0.1:${BRIDGE_PORT}/?token=${encodeURIComponent(BRIDGE_TOKEN)}`);

  websocket.addEventListener("open", () => {
    sendToBridge({
      version: 1,
      id: crypto.randomUUID(),
      sessionId: SESSION_ID,
      type: "pair.request",
      createdAt: new Date().toISOString(),
      payload: {
        clientKind: "browser-extension",
        userAgent: navigator.userAgent,
        extensionVersion: getExtensionVersion()
      }
    });
    flushPendingEnvelopes();
    startHeartbeat();
  });

  websocket.addEventListener("message", (event) => {
    chrome.runtime.sendMessage({
      type: "webchat.bridge.message",
      envelope: JSON.parse(event.data)
    });
  });

  websocket.addEventListener("close", scheduleReconnect);
  websocket.addEventListener("error", scheduleReconnect);
}

function sendToBridge(envelope) {
  if (websocket?.readyState === WebSocket.OPEN) {
    websocket.send(JSON.stringify(envelope));
    return true;
  }

  pendingEnvelopes.push(envelope);
  connectBridge();
  return false;
}

function flushPendingEnvelopes() {
  const toSend = pendingEnvelopes;
  pendingEnvelopes = [];

  for (const envelope of toSend) {
    sendToBridge(envelope);
  }
}

function startHeartbeat() {
  clearInterval(heartbeatTimer);
  heartbeatTimer = setInterval(() => {
    sendToBridge({
      version: 1,
      id: crypto.randomUUID(),
      sessionId: SESSION_ID,
      type: "bridge.status",
      createdAt: new Date().toISOString(),
      payload: {
        state: "alive",
        location: "offscreen"
      }
    });
  }, HEARTBEAT_MS);
}

function scheduleReconnect() {
  clearInterval(heartbeatTimer);
  clearTimeout(reconnectTimer);
  websocket = undefined;
  reconnectTimer = setTimeout(connectBridge, RECONNECT_DELAY_MS);
}

function getExtensionVersion() {
  if (typeof chrome.runtime.getManifest === "function") {
    return chrome.runtime.getManifest().version;
  }

  return "unknown";
}
