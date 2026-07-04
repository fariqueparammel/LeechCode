const SESSION_ID = "browser-extension";
const OFFSCREEN_DOCUMENT_PATH = "offscreen.html";
const PROVIDER_URL_PATTERNS = [
  "https://chatgpt.com/*",
  "https://claude.ai/*",
  "https://gemini.google.com/*",
  "https://chat.qwen.ai/*",
  "https://chat.deepseek.com/*",
  "https://aistudio.google.com/*",
  "http://127.0.0.1/*",
  "http://localhost/*"
];

let creatingOffscreenDocument;
let pendingPromptByTab = new Map();

chrome.runtime.onInstalled.addListener(() => {
  void ensureBridge();
  chrome.alarms.create("webchat.bridge.reconnect", { periodInMinutes: 0.25 });
});

chrome.runtime.onStartup.addListener(() => {
  void ensureBridge();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "webchat.bridge.reconnect") {
    void ensureBridge();
  }
});

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.type === "webchat.offscreen.ready") {
    return false;
  }

  if (message?.type === "webchat.bridge.message") {
    void handleBridgeMessage(message.envelope);
    return false;
  }

  if (message?.type === "webchat.content.keepalive") {
    void ensureBridge();
    return false;
  }

  if (
    message?.type === "webchat.content.state" ||
    message?.type === "webchat.content.stream" ||
    message?.type === "webchat.content.done" ||
    message?.type === "webchat.content.probe"
  ) {
    void sendToBridge({
      version: 1,
      id: crypto.randomUUID(),
      sessionId: SESSION_ID,
      type: message.bridgeType,
      createdAt: new Date().toISOString(),
      payload: {
        ...message.payload,
        tabId: sender.tab?.id,
        url: sender.tab?.url
      }
    });

    if (message?.type === "webchat.content.state" && message.payload?.state === "ready" && sender.tab?.id) {
      retryPendingPrompt(sender.tab.id);
    }
  }

  return false;
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "complete" && pendingPromptByTab.has(tabId)) {
    const envelope = pendingPromptByTab.get(tabId);
    pendingPromptByTab.delete(tabId);
    void sendPromptToTab(tabId, envelope);
  }
});

void ensureBridge();

async function ensureBridge() {
  await ensureOffscreenDocument();
  await chrome.runtime.sendMessage({ type: "webchat.bridge.connect" });
}

async function ensureOffscreenDocument() {
  const offscreenUrl = chrome.runtime.getURL(OFFSCREEN_DOCUMENT_PATH);

  if (await hasOffscreenDocument(offscreenUrl)) {
    return;
  }

  if (creatingOffscreenDocument) {
    await creatingOffscreenDocument;
    return;
  }

  creatingOffscreenDocument = chrome.offscreen.createDocument({
    url: OFFSCREEN_DOCUMENT_PATH,
    reasons: ["WORKERS"],
    justification: "Keep the localhost WebSocket bridge alive for long-running WebChat agent sessions."
  });

  try {
    await creatingOffscreenDocument;
  } finally {
    creatingOffscreenDocument = undefined;
  }
}

async function hasOffscreenDocument(offscreenUrl) {
  if (chrome.offscreen.hasDocument) {
    return chrome.offscreen.hasDocument();
  }

  const contexts = await chrome.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"],
    documentUrls: [offscreenUrl]
  });

  return contexts.length > 0;
}

async function sendToBridge(envelope) {
  await ensureOffscreenDocument();
  await chrome.runtime.sendMessage({
    type: "webchat.bridge.send",
    envelope
  });
}

async function handleBridgeMessage(envelope) {
  if (envelope?.type === "chat.prompt") {
    await dispatchPrompt(envelope);
  } else if (envelope?.type === "chat.cancel") {
    await forwardToActiveTab({ type: "webchat.cancel", envelope });
  } else if (envelope?.type === "chat.model") {
    await forwardToActiveTab({ type: "webchat.model", model: envelope.payload?.model, envelope });
  } else if (envelope?.type === "chat.toggle") {
    await forwardToActiveTab({ type: "webchat.toggle", label: envelope.payload?.label, envelope });
  } else if (envelope?.type === "chat.navigate") {
    await navigateToChat(envelope.payload?.url);
  } else if (envelope?.type === "chat.selectors") {
    await applySelectorOverrides(envelope.payload?.overrides || {});
  } else if (envelope?.type === "chat.probe") {
    await forwardToActiveTab({ type: "webchat.probe", envelope });
  }
}

// Persist per-site selector overrides in the extension's local storage (so every page of that site
// applies them on load, bridge or not) and push them live to all open provider tabs.
async function applySelectorOverrides(overrides) {
  try {
    await chrome.storage.local.set({ webchatSelectorOverrides: overrides });
  } catch {
    // storage unavailable; live push below still applies until reload
  }
  const tabs = await chrome.tabs.query({ url: PROVIDER_URL_PATTERNS });
  for (const tab of tabs) {
    if (!tab.id) {
      continue;
    }
    try {
      await chrome.tabs.sendMessage(tab.id, { type: "webchat.selectors", overrides });
    } catch {
      // tab without our content script — it will read storage on next load
    }
  }
}

async function navigateToChat(url) {
  if (!url) {
    return;
  }
  const tabs = await chrome.tabs.query({ url: PROVIDER_URL_PATTERNS });
  const activeTab = tabs.find((tab) => tab.active) || tabs[0];

  if (activeTab?.id) {
    await chrome.tabs.update(activeTab.id, { url, active: true });
  } else {
    await chrome.tabs.create({ active: true, url });
  }
}

async function forwardToActiveTab(message) {
  const tabs = await chrome.tabs.query({ url: PROVIDER_URL_PATTERNS });
  const activeTab = tabs.find((tab) => tab.active) || tabs[0];

  if (activeTab?.id) {
    try {
      await chrome.tabs.sendMessage(activeTab.id, message);
    } catch {
      // tab may be gone; nothing to do
    }
  }
}

async function dispatchPrompt(envelope) {
  const shouldOpenFreshChat = envelope.payload.expectedAction === "rotate";
  const tabs = shouldOpenFreshChat
    ? []
    : await chrome.tabs.query({ url: PROVIDER_URL_PATTERNS });
  const activeTab = tabs.find((tab) => tab.active) || tabs[0];

  if (activeTab?.id) {
    await sendPromptToTab(activeTab.id, envelope);
    return;
  }

  const created = await chrome.tabs.create({
    active: true,
    url: envelope.payload.chatUrl
  });

  if (created.id) {
    pendingPromptByTab.set(created.id, envelope);
  }
}

async function sendPromptToTab(tabId, envelope) {
  try {
    await chrome.tabs.sendMessage(tabId, {
      type: "webchat.prompt",
      envelope
    });
  } catch (error) {
    pendingPromptByTab.set(tabId, envelope);
    setTimeout(() => {
      void retryPendingPrompt(tabId);
    }, 1000);
    await sendToBridge({
      version: 1,
      id: crypto.randomUUID(),
      sessionId: SESSION_ID,
      type: "chat.error",
      createdAt: new Date().toISOString(),
      payload: {
        detail: error instanceof Error ? error.message : String(error),
        tabId
      }
    });
  }
}

async function retryPendingPrompt(tabId) {
  const envelope = pendingPromptByTab.get(tabId);

  if (!envelope) {
    return;
  }

  pendingPromptByTab.delete(tabId);
  await sendPromptToTab(tabId, envelope);
}
