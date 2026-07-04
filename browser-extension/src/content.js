const providers = [
  {
    id: "chatgpt",
    label: "ChatGPT",
    hosts: ["chatgpt.com"],
    inputSelectors: [
      "#prompt-textarea",
      "[data-testid='prompt-textarea']",
      "[contenteditable='true'][role='textbox']",
      ".ProseMirror",
      "textarea"
    ],
    submitSelectors: [
      "[data-testid='send-button']",
      "[data-testid='composer-submit-button']",
      "button[aria-label='Send prompt']",
      "button[aria-label='Send message']",
      "button[aria-label*='Send']",
      "button[type='submit']"
    ],
    assistantSelectors: [
      "[data-message-author-role='assistant']",
      "[data-testid='conversation-turn-assistant']",
      ".markdown"
    ]
  },
  {
    id: "claude",
    label: "Claude",
    hosts: ["claude.ai"],
    inputSelectors: [
      "[contenteditable='true'][role='textbox']",
      ".ProseMirror",
      "textarea",
      "[contenteditable='true']"
    ],
    submitSelectors: [
      "button[aria-label*='Send']",
      "button[data-testid*='send']",
      "button[type='submit']"
    ],
    assistantSelectors: [
      "[data-testid='chat-message-assistant']",
      ".font-claude-message",
      "[data-is-streaming]",
      "article"
    ]
  },
  {
    id: "gemini",
    label: "Gemini",
    hosts: ["gemini.google.com"],
    inputSelectors: [
      "rich-textarea .ql-editor[contenteditable='true']",
      "rich-textarea [contenteditable='true']",
      ".ql-editor[contenteditable='true']",
      "[aria-label='Enter a prompt here']",
      "[contenteditable='true'][role='textbox']",
      "textarea"
    ],
    submitSelectors: [
      "button[aria-label*='Send']",
      "button.send-button",
      "button[mattooltip*='Send']",
      "button[aria-label*='Submit']",
      "button[type='submit']"
    ],
    assistantSelectors: [
      "message-content .markdown",
      "message-content",
      ".model-response-text",
      "model-response",
      "[data-response-index]",
      "response-container",
      "article"
    ]
  },
  {
    id: "qwen",
    label: "Qwen",
    hosts: ["chat.qwen.ai"],
    inputSelectors: [
      "textarea#chat-input",
      ".chat-input textarea",
      "textarea[placeholder]",
      "textarea",
      "[contenteditable='true'][role='textbox']",
      "[role='textbox']",
      "[contenteditable='true']"
    ],
    submitSelectors: [
      "button[aria-label*='Send']",
      "button[class*='send']",
      "button[type='submit']",
      "button"
    ],
    assistantSelectors: [
      "[data-message-author-role='assistant']",
      ".markdown-body",
      "[class*='messageContent']",
      "[class*='assistant']",
      ".markdown",
      "article"
    ]
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    hosts: ["chat.deepseek.com"],
    inputSelectors: [
      "#chat-input",
      "textarea#chat-input",
      "textarea",
      "[contenteditable='true'][role='textbox']",
      "[contenteditable='true']"
    ],
    submitSelectors: [
      "button[aria-label*='Send']",
      "[role='button'][aria-disabled='false']",
      "div[class*='send']",
      "button[type='submit']",
      "button"
    ],
    assistantSelectors: [
      ".ds-markdown",
      "[class*='ds-markdown']",
      "[class*='message-content']",
      ".markdown",
      "div[class*='_assistant']"
    ]
  },
  {
    id: "aistudio",
    label: "Google AI Studio",
    hosts: ["aistudio.google.com"],
    inputSelectors: [
      "ms-autosize-textarea textarea",
      "textarea[aria-label*='prompt']",
      "textarea[placeholder]",
      "textarea",
      "[contenteditable='true']"
    ],
    submitSelectors: [
      "button[aria-label*='Run']",
      "run-button button",
      "button[type='submit']",
      "button[aria-label*='Send']",
      "button"
    ],
    assistantSelectors: [
      "ms-chat-turn[data-turn-role='Model'] ms-cmark-node",
      "ms-chat-turn .very-large-text-container",
      "ms-cmark-node",
      ".model-response-text",
      "ms-chat-turn"
    ]
  },
  {
    id: "mock",
    label: "Mock WebChat",
    hosts: ["127.0.0.1", "localhost"],
    inputSelectors: ["[data-webchat-input]", "textarea"],
    submitSelectors: ["[data-webchat-submit]", "button[type='submit']"],
    assistantSelectors: ["[data-webchat-assistant]"]
  }
];

const FALLBACK_INPUT_SELECTORS = [
  "[data-webchat-input]",
  "#prompt-textarea",
  "[data-testid='prompt-textarea']",
  "textarea",
  "[contenteditable='true']",
  "[role='textbox']",
  ".ProseMirror"
];
const FALLBACK_SUBMIT_SELECTORS = [
  "[data-webchat-submit]",
  "[data-testid='send-button']",
  "button[type='submit']",
  "button[aria-label]",
  "button"
];
const FALLBACK_ASSISTANT_SELECTORS = [
  "[data-webchat-assistant]",
  "[data-message-author-role='assistant']",
  "[data-testid='conversation-turn-assistant']",
  ".markdown",
  "article"
];
// "Stop generating" controls across providers, tried in order when the IDE cancels a prompt.
const STOP_SELECTORS = [
  "[data-testid='stop-button']",
  "button[data-testid*='stop']",
  "button[aria-label*='Stop']",
  "button[aria-label*='stop']",
  "button[aria-label*='Cancel generat']",
  "button.stop-button",
  "button.send-button.stop",
  "button[aria-label*='Stop response']"
];

const provider = providers.find((candidate) => candidate.hosts.includes(location.hostname));

// User-configured selector overrides, keyed by provider id. Persisted in chrome.storage.local (by
// background.js) so every page of that site applies them on load — no extension update needed when
// a provider redesigns its page. Custom selectors are tried FIRST; built-ins stay as fallbacks.
const SELECTOR_STORE_KEY = "webchatSelectorOverrides";
let selectorOverrides = {};
try {
  chrome.storage.local.get(SELECTOR_STORE_KEY, (data) => {
    if (data && data[SELECTOR_STORE_KEY]) {
      selectorOverrides = data[SELECTOR_STORE_KEY];
    }
  });
} catch {
  // storage unavailable — built-ins only
}

function effectiveSelectors(kind, fallbacks) {
  const custom = (selectorOverrides[provider.id] && selectorOverrides[provider.id][kind]) || [];
  return uniqueSelectors([...custom, ...(provider[kind] || []), ...fallbacks]);
}

// Provider error banners ("Something went wrong…") get scraped as if they were the reply. Detect
// and report them as a blocked state instead of streaming them to the IDE as an assistant answer.
const PROVIDER_ERROR_PATTERNS = [
  /^\s*something went wrong/i,
  /^\s*an error occurred/i,
  /^\s*oops[!,. ]/i,
  /^\s*network error/i,
  /^\s*message failed to send/i
];

function isProviderErrorText(text) {
  return text.length < 400 && PROVIDER_ERROR_PATTERNS.some((pattern) => pattern.test(text));
}

let latestAssistantText = "";
let lastDoneText = "";
let doneTimer;
let noResponseWarningTimer;
let noResponseBlockedTimer;
let assistantPollTimer;
let assistantPollStartedAt = 0;
let hasSentStreamingState = false;
let lastSubmittedEnvelope;
let submitRetries = 0;
const ASSISTANT_POLL_MS = 1000;
const MAX_ASSISTANT_POLL_MS = 180000;
const MAX_SUBMIT_RETRIES = 2;
const DISMISS_BUTTON_TEXTS = [
  "close",
  "dismiss",
  "not now",
  "maybe later",
  "no thanks",
  "no, thanks",
  "skip",
  "skip for now",
  "got it",
  "continue without logging in",
  "continue without an account",
  "continue as guest",
  "use without signing in",
  "stay logged out",
  "stay signed out",
  "reject all",
  "reject non-essential",
  "decline",
  "dismiss all"
];
const NON_DISMISS_ACTION_TEXTS = [
  "log in",
  "login",
  "sign in",
  "sign up",
  "sign up for free",
  "create account",
  "continue with google",
  "continue with microsoft",
  "continue with apple",
  "accept all",
  "i agree",
  "agree",
  "upgrade",
  "subscribe",
  "get plus",
  "see plans"
];

if (provider) {
  sendState("ready", `${provider.label} page detected`);
  setInterval(() => {
    chrome.runtime.sendMessage({
      type: "webchat.content.keepalive",
      providerId: provider.id,
      location: location.href
    });
  }, 3000);

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "webchat.prompt") {
      void insertPrompt(message.envelope);
    } else if (message?.type === "webchat.cancel") {
      cancelGeneration();
    } else if (message?.type === "webchat.model") {
      void switchModel(message.model);
    } else if (message?.type === "webchat.toggle") {
      toggleFeature(message.label);
    } else if (message?.type === "webchat.selectors") {
      selectorOverrides = message.overrides || {};
      sendState("ready", "Page-adapter selectors updated from the IDE.");
    } else if (message?.type === "webchat.probe") {
      runProbe();
    }
  });

  const observer = new MutationObserver(() => {
    handleAssistantMutation();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true
  });
}

async function insertPrompt(envelope, isRetry = false) {
  if (!isRetry) {
    submitRetries = 0; // a fresh prompt resets the retry budget
  }
  await dismissBlockingUi();

  const target = findPromptInput();

  if (!target) {
    // The input may be hidden behind a login/upsell modal — retry after dismissing before giving up.
    if (envelope.payload.autoSubmit && submitRetries < MAX_SUBMIT_RETRIES) {
      submitRetries += 1;
      await dismissBlockingUi();
      sendState("submitting", `Chat input was covered; retrying (attempt ${submitRetries + 1})…`);
      await sleep(400);
      return insertPrompt(envelope, true);
    }
    sendState("blocked", "Could not find the chat input on this page.");
    return;
  }

  const existingAssistantText = findLatestAssistantText();
  latestAssistantText = existingAssistantText;
  lastDoneText = existingAssistantText;
  hasSentStreamingState = false;
  clearResponseTimers();
  clearAssistantPolling();
  await setInputText(target, envelope.payload.prompt);
  await dismissBlockingUi();

  if (envelope.payload.attachments && envelope.payload.attachments.length > 0) {
    await injectAttachments(target, envelope.payload.attachments);
  }

  if (envelope.payload.autoSubmit) {
    lastSubmittedEnvelope = envelope; // remember it so a stalled submit can be retried
    const submitted = await submitPrompt(target);

    if (!submitted) {
      sendState("blocked", "Prompt inserted, but no enabled chat submit control was found.");
      return;
    }

    sendState("submitting", submitted.detail);
    setTimeout(() => {
      void dismissBlockingUi();
    }, 1000);
    startAssistantPolling();
    scheduleNoResponseWatch();
    return;
  }

  sendState("prompt-inserted", "Prompt inserted into the active chat input. Submit it in the browser to continue.");
}

function handleAssistantMutation() {
  const fullText = findLatestAssistantText();

  if (!fullText || fullText === latestAssistantText) {
    return;
  }

  if (isProviderErrorText(fullText)) {
    // An error banner, not a reply — surface it as blocked so the IDE can retry, and re-baseline so
    // it is never streamed as assistant text.
    latestAssistantText = fullText;
    lastDoneText = fullText;
    clearTimeout(doneTimer);
    sendState("blocked", `Provider error banner: ${fullText.slice(0, 140)}`);
    return;
  }

  const delta = fullText.startsWith(latestAssistantText)
    ? fullText.slice(latestAssistantText.length)
    : fullText;
  latestAssistantText = fullText;

  if (!hasSentStreamingState) {
    hasSentStreamingState = true;
    clearResponseTimers();
    sendState("streaming", "Assistant response is streaming.");
  }

  chrome.runtime.sendMessage({
    type: "webchat.content.stream",
    bridgeType: "chat.stream.delta",
    payload: {
      providerId: provider.id,
      text: delta,
      fullText
    }
  });

  scheduleDone(fullText);
}

function scheduleDone(fullText) {
  clearTimeout(doneTimer);
  doneTimer = setTimeout(() => {
    if (!latestAssistantText || latestAssistantText !== fullText || lastDoneText === fullText) {
      return;
    }

  lastDoneText = fullText;
  clearAssistantPolling();
  chrome.runtime.sendMessage({
      type: "webchat.content.done",
      bridgeType: "chat.stream.done",
      payload: {
        providerId: provider.id,
        fullText,
        finishReason: "complete"
      }
    });
    sendState("complete", "Assistant response completed.");
  }, 1500);
}

function findPromptInput() {
  const selectors = effectiveSelectors("inputSelectors", FALLBACK_INPUT_SELECTORS);

  for (const selector of selectors) {
    const nodes = [...document.querySelectorAll(selector)];
    const visible = nodes.find((node) => isVisible(node));

    if (visible) {
      return visible;
    }
  }

  return undefined;
}

async function setInputText(target, text) {
  target.focus();

  if (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement) {
    // Native value setter REPLACES the whole value, so leftovers from a failed/retried prompt are
    // cleared automatically.
    const setter = Object.getOwnPropertyDescriptor(target.constructor.prototype, "value")?.set;
    setter?.call(target, text);
    target.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
    target.dispatchEvent(new Event("change", { bubbles: true }));
    await sleep(100);
    return;
  }

  // contenteditable (ProseMirror/Quill): select-all THROUGH the editor's own command pipeline, then
  // insert — this replaces any previous prompt still sitting in the box (e.g. after a provider
  // error + retry) instead of appending to it. Raw Range surgery desyncs ProseMirror's state, which
  // is how stale text used to survive.
  const selectedAll = document.execCommand?.("selectAll", false);
  if (!selectedAll) {
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(target);
    selection?.removeAllRanges();
    selection?.addRange(range);
  }

  const inserted = document.execCommand?.("insertText", false, text);

  if (!inserted) {
    target.textContent = text; // last resort: hard replace
  }

  target.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
  await sleep(250);

  // Belt-and-braces: if the editor somehow kept old content prepended/appended, hard-replace it.
  const current = (target.textContent || "").trim();
  if (current !== text.trim() && current.includes(text.trim()) === false) {
    target.textContent = text;
    target.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
    await sleep(150);
  }
}

async function submitPrompt(target) {
  // CRITICAL: never interrupt an in-flight generation. While the assistant is responding, the
  // "send" control is usually a "Stop" button (and Enter/form-submit can also cancel), so submitting
  // the next chunk here would abort the current one. Wait until generation is idle first.
  await waitForGenerationIdle();

  const button = await waitForSubmitButton();

  if (button) {
    button.click();
    return { detail: "Prompt inserted and submitted via send button." };
  }

  // Fallbacks only when definitely NOT generating, so we can't accidentally stop a response.
  if (!isGenerating()) {
    const form = target.closest("form");

    if (form instanceof HTMLFormElement) {
      form.requestSubmit();
      return { detail: "Prompt inserted and submitted via chat form." };
    }

    target.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Enter",
      code: "Enter",
      bubbles: true,
      cancelable: true
    }));

    return { detail: "Prompt inserted and submitted via Enter fallback." };
  }

  return { detail: "A response is still generating — inserted the next part without interrupting it." };
}

/** True while the assistant is streaming a response (a Stop control is visible). */
function isGenerating() {
  for (const selector of STOP_SELECTORS) {
    const el = [...document.querySelectorAll(selector)].find(
      (node) => node instanceof HTMLElement && isVisible(node) && !(node instanceof HTMLButtonElement && node.disabled)
    );
    if (el) {
      return true;
    }
  }
  return false;
}

/** Wait until no generation is in flight (the Stop control has cleared), up to a timeout. */
async function waitForGenerationIdle(timeoutMs = 90000) {
  const startedAt = Date.now();
  while (isGenerating() && Date.now() - startedAt < timeoutMs) {
    await sleep(300);
  }
}

function findSubmitButton() {
  const selectors = effectiveSelectors("submitSelectors", FALLBACK_SUBMIT_SELECTORS);

  for (const selector of selectors) {
    const buttons = [...document.querySelectorAll(selector)];
    const button = buttons.find((candidate) => {
      const label = `${candidate.getAttribute("aria-label") || ""} ${candidate.textContent || ""}`.toLowerCase();
      const testId = (candidate.getAttribute("data-testid") || "").toLowerCase();
      // Never treat a Stop/cancel control as the send button (clicking it aborts the response).
      const looksLikeStop = testId.includes("stop") || label.includes("stop") || label.includes("cancel");
      const looksLikeSend = selector === "[data-webchat-submit]" ||
        testId.includes("send") ||
        label.includes("send") ||
        label.includes("submit");

      return looksLikeSend &&
        !looksLikeStop &&
        candidate instanceof HTMLButtonElement &&
        !candidate.disabled &&
        isVisible(candidate);
    });

    if (button) {
      return button;
    }
  }

  return undefined;
}

// Report which selector actually matches each role on the live page — feedback for the IDE's
// Page Adapter GUI ("Test on live page").
function runProbe() {
  const inputEl = findPromptInput();
  const submitEl = findSubmitButton();

  const assistantSelectors = effectiveSelectors("assistantSelectors", FALLBACK_ASSISTANT_SELECTORS);
  let assistant = null;
  let assistantChars = 0;
  for (const selector of assistantSelectors) {
    const nodes = [...document.querySelectorAll(selector)].filter((node) => isVisible(node));
    const latest = nodes.at(-1)?.textContent?.trim();
    if (latest) {
      assistant = selector;
      assistantChars = latest.length;
      break;
    }
  }

  chrome.runtime.sendMessage({
    type: "webchat.content.probe",
    bridgeType: "chat.probe.result",
    payload: {
      providerId: provider.id,
      url: location.href,
      input: matchedSelector(inputEl, effectiveSelectors("inputSelectors", FALLBACK_INPUT_SELECTORS)),
      submit: matchedSelector(submitEl, effectiveSelectors("submitSelectors", FALLBACK_SUBMIT_SELECTORS)),
      assistant,
      assistantChars
    }
  });
}

function matchedSelector(el, selectors) {
  if (!el) {
    return null;
  }
  for (const selector of selectors) {
    try {
      if (el.matches(selector)) {
        return selector;
      }
    } catch {
      // invalid user selector — skip
    }
  }
  return selectors[0] || null;
}

function cancelGeneration() {
  // Stop our own streaming/quiescence timers so no late 'done' is emitted for the cancelled turn.
  clearTimeout(doneTimer);
  clearResponseTimers();
  clearAssistantPolling();

  const button = findStopButton();
  if (button) {
    button.click();
    sendState("cancelled", "Stopped generating (user cancelled).");
  } else {
    sendState("cancelled", "User cancelled; no stop control was found on the page.");
  }

  // Re-baseline so the (partial) cancelled response isn't re-detected/streamed.
  const current = findLatestAssistantText();
  latestAssistantText = current;
  lastDoneText = current;
  hasSentStreamingState = false;
}

// Inject pasted images/files into the provider's composer. Tried in order of reliability:
//   1. the page's own (usually hidden) file input — set .files and fire change (the upload path
//      every provider supports),
//   2. a synthetic drop event on the composer (drag-and-drop upload),
//   3. a synthetic paste event (least reliable — clipboardData is read-only in some engines).
async function injectAttachments(target, attachments) {
  for (const att of attachments) {
    try {
      const file = new File([base64ToBlob(att.dataBase64, att.mimeType)], att.name || "upload", {
        type: att.mimeType || "application/octet-stream"
      });
      const dt = new DataTransfer();
      dt.items.add(file);

      if (injectViaFileInput(dt)) {
        sendState("submitting", `Attached ${file.name} via the page's file input.`);
      } else if (injectViaDrop(target, dt)) {
        sendState("submitting", `Attached ${file.name} via drag-and-drop.`);
      } else {
        const pasteEvent = new ClipboardEvent("paste", { bubbles: true, cancelable: true });
        try {
          Object.defineProperty(pasteEvent, "clipboardData", { value: dt });
        } catch {
          /* some engines make clipboardData read-only; the event may still be handled */
        }
        target.focus();
        target.dispatchEvent(pasteEvent);
      }
      // Give the page time to process the upload + render its preview before the next one / submit.
      await sleep(1400);
    } catch {
      sendState("submitting", "Couldn't attach a file to the page automatically (enable the local vision option as a fallback).");
    }
  }
}

/** Put the files on the page's own upload <input type="file"> and fire change. Most reliable path. */
function injectViaFileInput(dt) {
  const inputs = [...document.querySelectorAll("input[type='file']")].filter((input) => {
    const accept = (input.getAttribute("accept") || "").toLowerCase();
    return !accept || accept.includes("image") || accept.includes("*");
  });
  const input = inputs[0];
  if (!input) {
    return false;
  }
  try {
    input.files = dt.files;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  } catch {
    return false;
  }
}

/** Simulate dropping the files onto the composer (providers support drag-and-drop upload). */
function injectViaDrop(target, dt) {
  try {
    const zone = target.closest("form") || target.parentElement || target;
    const drop = (type) =>
      zone.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt }));
    drop("dragenter");
    drop("dragover");
    return drop("drop") !== undefined;
  } catch {
    return false;
  }
}

function base64ToBlob(b64, mime) {
  const chars = atob(b64);
  const bytes = new Uint8Array(chars.length);
  for (let i = 0; i < chars.length; i += 1) {
    bytes[i] = chars.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime || "application/octet-stream" });
}

function findStopButton() {
  for (const selector of STOP_SELECTORS) {
    const nodes = [...document.querySelectorAll(selector)];
    const button = nodes.find(
      (candidate) => candidate instanceof HTMLButtonElement && !candidate.disabled && isVisible(candidate)
    );
    if (button) {
      return button;
    }
  }
  return undefined;
}

// Best-effort model switching: open the provider's model picker and click the matching option.
// Provider menus differ and change often, so this is heuristic and reports what it did.
const MODEL_OPENER_SELECTORS = [
  "[data-testid*='model-switcher']",
  "[data-testid*='model-selector']",
  "button[aria-label*='model' i]",
  "button[aria-haspopup='menu']",
  "button[aria-haspopup='listbox']",
  "[class*='model'] button[aria-haspopup]"
];

async function switchModel(modelName) {
  const wanted = String(modelName || "").trim();
  if (!wanted) {
    return;
  }
  await dismissBlockingUi();

  const opener = firstVisible(MODEL_OPENER_SELECTORS);
  if (!opener) {
    sendState("submitting", `Couldn't find the model selector to switch to "${wanted}".`);
    return;
  }
  opener.click();
  await sleep(450);

  const option = findModelOption(wanted);
  if (option) {
    option.click();
    sendState("ready", `Switched model to "${wanted}".`);
  } else {
    // Close the menu we opened and report.
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true }));
    sendState("ready", `Opened the model menu but couldn't find an option matching "${wanted}".`);
  }
}

// Toggle an on-page feature button (e.g. DeepSeek's Search / DeepThink) by its visible label.
function toggleFeature(label) {
  const wanted = String(label || "").toLowerCase().trim();
  if (!wanted) {
    return;
  }
  const candidates = [
    ...document.querySelectorAll("button, [role='button'], [role='switch'], [role='checkbox']")
  ].filter((el) => el instanceof HTMLElement && isVisible(el));

  // Prefer an exact/prefix label match over a loose contains, and shorter labels (real toggles are terse).
  const scored = candidates
    .map((el) => ({ el, text: getControlLabel(el) }))
    .filter((c) => c.text && c.text.length < 40 && c.text.includes(wanted))
    .sort((a, b) => {
      const aExact = a.text === wanted || a.text.startsWith(wanted) ? 0 : 1;
      const bExact = b.text === wanted || b.text.startsWith(wanted) ? 0 : 1;
      return aExact - bExact || a.text.length - b.text.length;
    });

  const target = scored[0]?.el;
  if (target) {
    target.click();
    sendState("ready", `Toggled "${label}".`);
  } else {
    sendState("ready", `Couldn't find the "${label}" control on this page.`);
  }
}

function firstVisible(selectors) {
  for (const selector of selectors) {
    const node = [...document.querySelectorAll(selector)].find((n) => n instanceof HTMLElement && isVisible(n));
    if (node) {
      return node;
    }
  }
  return undefined;
}

function findModelOption(wanted) {
  const target = wanted.toLowerCase();
  const candidates = [
    ...document.querySelectorAll("[role='menuitem'], [role='option'], [role='menuitemradio'], li[tabindex], button")
  ];
  return candidates.find((node) => {
    if (!(node instanceof HTMLElement) || !isVisible(node)) {
      return false;
    }
    const text = (node.textContent || "").trim().toLowerCase();
    return text.length > 0 && text.length < 80 && text.includes(target);
  });
}

async function dismissBlockingUi() {
  let dismissed = 0;

  document.dispatchEvent(new KeyboardEvent("keydown", {
    key: "Escape",
    code: "Escape",
    bubbles: true,
    cancelable: true
  }));
  await sleep(100);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const control = findDismissControl();

    if (!control) {
      break;
    }

    control.click();
    dismissed += 1;
    await sleep(250);
  }

  if (dismissed > 0) {
    sendState("submitting", `Dismissed ${dismissed} provider overlay${dismissed === 1 ? "" : "s"}.`);
  }

  return dismissed;
}

function findDismissControl() {
  // Match buttons AND links / role=button elements — providers often make the "escape hatch"
  // (e.g. ChatGPT's "Stay logged out") an <a> or a div[role=button], not a real <button>.
  const controls = [
    ...document.querySelectorAll(
      [
        "[role='dialog'] button",
        "[role='dialog'] a",
        "[role='dialog'] [role='button']",
        "[data-testid*='modal'] button",
        "[data-testid*='modal'] a",
        "button[aria-label]",
        "button",
        "a[role='button']",
        "[role='button']"
      ].join(", ")
    )
  ];

  return controls.find((control) => {
    if (!(control instanceof HTMLElement) || !isVisible(control)) {
      return false;
    }
    if (control instanceof HTMLButtonElement && control.disabled) {
      return false;
    }

    const label = getControlLabel(control);

    if (!label || NON_DISMISS_ACTION_TEXTS.some((action) => label.includes(action))) {
      return false;
    }

    const testId = (control.getAttribute("data-testid") || "").toLowerCase();
    const looksLikeIconClose = !control.textContent?.trim() &&
      (label.includes("close") || label.includes("dismiss") || testId.includes("close"));
    const looksLikeDismissText = DISMISS_BUTTON_TEXTS.some((text) => label === text || label.includes(text));

    return looksLikeIconClose || looksLikeDismissText;
  });
}

function getControlLabel(control) {
  return [
    control.getAttribute("aria-label"),
    control.getAttribute("title"),
    control.getAttribute("data-testid"),
    control.textContent
  ].filter(Boolean).join(" ").trim().toLowerCase().replace(/\s+/g, " ");
}

async function waitForSubmitButton(timeoutMs = 5000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const button = findSubmitButton();

    if (button) {
      return button;
    }

    await sleep(100);
  }

  return undefined;
}

function isVisible(node) {
  const rect = node.getBoundingClientRect();
  const style = getComputedStyle(node);
  return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
}

function sendState(state, detail) {
  chrome.runtime.sendMessage({
    type: "webchat.content.state",
    bridgeType: "chat.state",
    payload: {
      providerId: provider.id,
      state,
      detail,
      title: document.title
    }
  });
}

function scheduleNoResponseWatch() {
  clearResponseTimers();
  // Early nudge: if nothing is streaming yet, a login/upsell overlay probably swallowed our submit.
  // Dismiss it and RE-SUBMIT the same message (that's the retry the page usually needs).
  noResponseWarningTimer = setTimeout(() => {
    if (hasSentStreamingState) {
      return;
    }
    void dismissBlockingUi().then(async (dismissed) => {
      if (dismissed > 0 && lastSubmittedEnvelope && submitRetries < MAX_SUBMIT_RETRIES) {
        submitRetries += 1;
        sendState("submitting", `Dismissed an overlay; retrying the message (attempt ${submitRetries + 1})…`);
        await insertPrompt(lastSubmittedEnvelope, true);
        return;
      }
      sendState(
        "waiting-response",
        dismissed > 0
          ? "Dismissed a provider overlay; waiting for the assistant response."
          : "Prompt submitted; no assistant response detected yet."
      );
    });
  }, 10000);
  // Last resort: still nothing after 45s — retry once more, then report blocked so the IDE can react.
  noResponseBlockedTimer = setTimeout(() => {
    if (hasSentStreamingState) {
      return;
    }
    void dismissBlockingUi().then(async (dismissed) => {
      if (lastSubmittedEnvelope && submitRetries < MAX_SUBMIT_RETRIES) {
        submitRetries += 1;
        sendState("submitting", `No response yet; retrying the message (attempt ${submitRetries + 1})…`);
        await insertPrompt(lastSubmittedEnvelope, true);
        return;
      }
      sendState(
        "blocked",
        dismissed > 0
          ? "No assistant response was detected after dismissing provider overlays and retrying."
          : "No assistant response after submission + retries. The page may need login, be rate-limited, or awaiting a confirmation. The chat itself may still work — try again from the panel."
      );
    });
  }, 45000);
}

function clearResponseTimers() {
  clearTimeout(noResponseWarningTimer);
  clearTimeout(noResponseBlockedTimer);
}

function startAssistantPolling() {
  clearAssistantPolling();
  assistantPollStartedAt = Date.now();
  assistantPollTimer = setInterval(() => {
    handleAssistantMutation();

    if (Date.now() - assistantPollStartedAt > MAX_ASSISTANT_POLL_MS) {
      clearAssistantPolling();
    }
  }, ASSISTANT_POLL_MS);
}

function clearAssistantPolling() {
  clearInterval(assistantPollTimer);
  assistantPollTimer = undefined;
  assistantPollStartedAt = 0;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function findLatestAssistantText() {
  const candidates = effectiveSelectors("assistantSelectors", FALLBACK_ASSISTANT_SELECTORS);

  for (const selector of candidates) {
    const nodes = [...document.querySelectorAll(selector)].filter((node) => isVisible(node));
    const latest = nodes.at(-1)?.textContent?.trim();

    if (latest) {
      return latest;
    }
  }

  return "";
}

function uniqueSelectors(selectors) {
  return [...new Set(selectors.filter(Boolean))];
}
