import { useState, type ReactNode } from "react";
import type { BridgeStatusInfo, ProviderInfo, SelectorOverrideInfo, WebChatSettings } from "../src/webview/messages";
import { post } from "./vscodeApi";

interface SettingsViewProps {
  settings: WebChatSettings;
  providers: readonly ProviderInfo[];
  bridge: BridgeStatusInfo;
  onBack: () => void;
}

function update(key: keyof WebChatSettings, value: string | number | boolean): void {
  post({ type: "updateSetting", key, value });
}

export function SettingsView({ settings, providers, bridge, onBack }: SettingsViewProps) {
  const current = providers.find((p) => p.id === settings.defaultProvider);
  return (
    <div className="settings">
      <div className="settings-header">
        <button className="btn ghost back-btn" onClick={onBack} title="Back to chat">
          ← Back to chat
        </button>
        <h2 className="settings-heading">Settings</h2>
      </div>

      <Section title="Provider" hint="Which web chat tab LeechCode drives.">
        <SelectField
          label="Default provider"
          value={settings.defaultProvider}
          options={providers.map((provider) => ({
            value: provider.id,
            label: `${provider.label}${provider.imageSupport && provider.imageSupport !== "none" ? `  ·  images: ${provider.imageSupport}` : ""}`
          }))}
          onChange={(value) => update("defaultProvider", value)}
        />
        {current ? <CapabilityRow provider={current} /> : null}
        {current?.models && current.models.length > 0 ? (
          <SelectField
            label={`Model on ${current.label} (switches in the browser)`}
            hint="Best-effort: opens the provider's model picker and selects this. Providers rename models often; pick the closest match."
            value=""
            options={[{ value: "", label: "— switch model… —" }, ...current.models.map((m) => ({ value: m, label: m }))]}
            onChange={(value) => {
              if (value) {
                post({ type: "setModel", model: value });
              }
            }}
          />
        ) : null}
        {current ? <ModelListEditor key={current.id} provider={current} /> : null}
        <NumberField
          label={`Max message length for ${settings.currentProviderLabel || "this provider"} (chars)`}
          hint="Per-message input limit for this chat. WebChat trims context — or splits a codebase index — to fit so messages aren't rejected as 'too long'. Set per provider — switch the default provider above to edit another."
          value={settings.messageLimit}
          min={1000}
          step={1000}
          onChange={(value) => update("messageLimit", value)}
        />
        <NumberField
          label={`Max conversation length for ${settings.currentProviderLabel || "this provider"} (chars)`}
          hint="Total characters WebChat will deliver into one chat — caps how much of a whole-codebase index is sent so it doesn't overflow the session window. Set per provider."
          value={settings.sessionLimit}
          min={4000}
          step={10000}
          onChange={(value) => update("sessionLimit", value)}
        />
        <ToggleField
          label="Auto-submit prompts"
          hint="Press send in the chat automatically after inserting the prompt."
          checked={settings.autoSubmit}
          onChange={(value) => update("autoSubmit", value)}
        />
        <ToggleField
          label="Use editor selection only"
          hint="Send just the highlighted code instead of the whole active file."
          checked={settings.includeSelectionOnly}
          onChange={(value) => update("includeSelectionOnly", value)}
        />
      </Section>

      <Section title="Context window & budget" hint="Customize the token window before WebChat compacts or starts a fresh chat.">
        <ToggleField
          label="Chunk large codebase index"
          hint="When @codebase / /index is too big for one message, deliver it as several ordered messages (the chat acknowledges each) instead of truncating. Disable to send a single truncated message."
          checked={settings.indexChunked}
          onChange={(value) => update("indexChunked", value)}
        />
        <NumberField
          label="Max context tokens"
          hint="Approximate total window for one chat session."
          value={settings.maxContextTokens}
          min={1000}
          step={1000}
          onChange={(value) => update("maxContextTokens", value)}
        />
        <NumberField
          label="Max input tokens"
          value={settings.maxInputTokens}
          min={1000}
          step={1000}
          onChange={(value) => update("maxInputTokens", value)}
        />
        <NumberField
          label="Max output tokens"
          value={settings.maxOutputTokens}
          min={1000}
          step={1000}
          onChange={(value) => update("maxOutputTokens", value)}
        />
        <NumberField
          label="Compact every N prompts"
          hint="Ask the model to summarize durable state on this cadence."
          value={settings.compactEveryPrompts}
          min={1}
          step={1}
          onChange={(value) => update("compactEveryPrompts", value)}
        />
        <NumberField
          label="Rotate when remaining below"
          hint="Start a fresh chat when this fraction of budget is left (e.g. 0.15 = 15%)."
          value={settings.rotateWhenBudgetRemainingBelow}
          min={0.01}
          max={0.9}
          step={0.01}
          onChange={(value) => update("rotateWhenBudgetRemainingBelow", value)}
        />
      </Section>

      <Section title="Agent" hint="What happens when the chat returns file changes.">
        <SelectField
          label="Apply mode"
          value={settings.applyMode}
          options={[
            { value: "ask", label: "Ask (show Apply / Preview / Skip)" },
            { value: "auto", label: "Auto-apply" },
            { value: "never", label: "Never (capture only)" }
          ]}
          onChange={(value) => update("applyMode", value)}
        />
        <ToggleField
          label="Auto-repair invalid responses"
          hint="Ask the chat once for a corrected tool block when JSON is malformed."
          checked={settings.autoRepair}
          onChange={(value) => update("autoRepair", value)}
        />
      </Section>

      {current ? (
        <Section
          title={`Page adapter — fix ${current.label} yourself`}
          hint={`If ${current.label} updates its website and LeechCode stops finding things, paste new CSS selectors here — no extension update needed. The same three universal fields work for every chat site. Saved per website: pushed to the browser live and stored in the extension's local storage, so every ${current.label} tab uses them. Empty = built-in selectors.`}
        >
          <SelectorEditor key={current.id} provider={current} saved={settings.providerSelectors[current.id]} />
        </Section>
      ) : null}

      <Section
        title="Local vision (image → text)"
        hint="Bring your own local model to read pasted/attached images, so the web chat's limited image support doesn't matter. The image's description/OCR is injected into the prompt as text."
      >
        <ToggleField
          label="Use a local vision model for images"
          checked={settings.visionEnabled}
          onChange={(value) => update("visionEnabled", value)}
        />
        <TextField
          label="Endpoint (OpenAI-compatible)"
          hint="e.g. http://localhost:11434/v1/chat/completions (Ollama) · http://localhost:1234/v1/chat/completions (LM Studio)"
          value={settings.visionEndpoint}
          onChange={(value) => update("visionEndpoint", value)}
        />
        <TextField
          label="Vision model"
          hint="e.g. llava · llama3.2-vision · qwen2.5vl · minicpm-v"
          value={settings.visionModel}
          onChange={(value) => update("visionModel", value)}
        />
      </Section>

      <Section title="Bridge" hint="Local connection between the editor and the browser extension.">
        <div className="bridge-status-row">
          <span className={`dot ${bridge.running ? (bridge.clientCount > 0 ? "ok" : "warn") : "off"}`} />
          <span>
            {bridge.running
              ? `Listening on 127.0.0.1:${bridge.port} · ${bridge.clientCount} browser client${bridge.clientCount === 1 ? "" : "s"}`
              : "Not running"}
          </span>
        </div>
        <NumberField
          label="Port"
          hint="Keep the browser extension's port in sync. Reload the window after changing."
          value={settings.bridgePort}
          min={1024}
          max={65535}
          step={1}
          onChange={(value) => update("bridgePort", value)}
        />
        <TextField
          label="Token"
          hint="Shared secret. Keep the browser extension token identical."
          value={settings.bridgeToken}
          onChange={(value) => update("bridgeToken", value)}
        />
      </Section>
    </div>
  );
}

/**
 * Per-site selector editor: the three universal roles every chat page has. One CSS selector per
 * line; customs are tried before the built-ins. "Test on live page" probes the open tab and reports
 * which selector matched each role.
 */
function SelectorEditor({ provider, saved }: { provider: ProviderInfo; saved?: SelectorOverrideInfo }) {
  const [input, setInput] = useState((saved?.inputSelectors ?? []).join("\n"));
  const [submit, setSubmit] = useState((saved?.submitSelectors ?? []).join("\n"));
  const [assistant, setAssistant] = useState((saved?.assistantSelectors ?? []).join("\n"));

  const toList = (value: string) => value.split("\n").map((s) => s.trim()).filter(Boolean);
  const save = () =>
    post({
      type: "setProviderSelectors",
      providerId: provider.id,
      inputSelectors: toList(input),
      submitSelectors: toList(submit),
      assistantSelectors: toList(assistant)
    });
  const reset = () => {
    setInput("");
    setSubmit("");
    setAssistant("");
    post({ type: "setProviderSelectors", providerId: provider.id, inputSelectors: [], submitSelectors: [], assistantSelectors: [] });
  };

  return (
    <>
      <SelectorArea
        label="Chat input box (where the prompt is typed)"
        placeholder={"#prompt-textarea\n[contenteditable='true'][role='textbox']"}
        value={input}
        onChange={setInput}
      />
      <SelectorArea
        label="Send button"
        placeholder={"[data-testid='send-button']\nbutton[aria-label*='Send']"}
        value={submit}
        onChange={setSubmit}
      />
      <SelectorArea
        label="Reply container (the assistant's answer)"
        placeholder={"[data-message-author-role='assistant']\n.markdown"}
        value={assistant}
        onChange={setAssistant}
      />
      <div className="selector-actions">
        <button className="btn primary" onClick={save}>
          Save &amp; apply
        </button>
        <button
          className="btn ghost"
          title="Probes the open provider tab with the SAVED selectors and reports which one matched each role — save first"
          onClick={() => post({ type: "probeSelectors" })}
        >
          Test on live page
        </button>
        <button className="btn ghost" onClick={reset}>
          Reset to built-ins
        </button>
      </div>
      <span className="field-hint">
        One CSS selector per line, most specific first — customs are tried before the built-ins, which stay as
        fallbacks. Finding a selector: right-click the element on the chat page → Inspect → prefer data-testid /
        aria-label / id (avoid random class names). Full guide: docs/provider-adapters.md.
      </span>
    </>
  );
}

function SelectorArea({
  label,
  placeholder,
  value,
  onChange
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <textarea
        className="field-input selector-textarea"
        rows={2}
        spellCheck={false}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

/**
 * Add/remove the models offered for a provider. Providers deprecate and rename models constantly,
 * so the shipped defaults are only a starting point — every add/remove persists immediately to the
 * per-provider override (webchat.provider.models) and refreshes the switchers.
 */
function ModelListEditor({ provider }: { provider: ProviderInfo }) {
  const [draft, setDraft] = useState("");
  const models = provider.models ?? [];

  const commit = (next: readonly string[]) =>
    post({ type: "setProviderModels", providerId: provider.id, models: next });

  const add = () => {
    const name = draft.trim();
    if (!name || models.includes(name)) {
      setDraft("");
      return;
    }
    commit([...models, name]);
    setDraft("");
  };

  return (
    <div className="field">
      <span className="field-label">Models listed for {provider.label} (add / remove)</span>
      <div className="model-chip-row">
        {models.map((model) => (
          <span className="model-chip" key={model} title={`Shown in the model switcher for ${provider.label}`}>
            {model}
            <button className="attach-remove" title="Remove this model" onClick={() => commit(models.filter((m) => m !== model))}>
              ×
            </button>
          </span>
        ))}
        {models.length === 0 ? <span className="session-empty">no models listed — add one below</span> : null}
      </div>
      <div className="model-add-row">
        <input
          type="text"
          className="field-input"
          placeholder="e.g. 3 Pro — as shown in the provider's own model menu"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              add();
            }
          }}
        />
        <button className="btn ghost" disabled={!draft.trim()} onClick={add}>
          Add
        </button>
      </div>
      <span className="field-hint">
        Each entry must match (part of) a name in {provider.label}'s own model menu — the switcher clicks the first
        menu item containing it. Providers rename models often; update this list anytime, no reload needed.
      </span>
    </div>
  );
}

function CapabilityRow({ provider }: { provider: ProviderInfo }) {
  const chips: { label: string; kind: string }[] = [];
  for (const tag of provider.tags ?? []) {
    chips.push({ label: tag, kind: "tag" });
  }
  if (provider.imageSupport && provider.imageSupport !== "none") {
    chips.push({ label: `images: ${provider.imageSupport}`, kind: `img-${provider.imageSupport}` });
  }
  if (chips.length === 0) {
    return null;
  }
  return (
    <div className="capability-row" title="Rough capabilities of this provider on a typical free/logged-in session">
      {chips.map((chip) => (
        <span key={chip.label} className={`cap-chip cap-${chip.kind}`}>
          {chip.label}
        </span>
      ))}
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="settings-section">
      <h3 className="section-title">{title}</h3>
      {hint ? <p className="section-hint">{hint}</p> : null}
      <div className="section-body">{children}</div>
    </section>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  );
}

function NumberField({
  label,
  hint,
  value,
  min,
  max,
  step,
  onChange
}: {
  label: string;
  hint?: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  return (
    <Field label={label} hint={hint}>
      <input
        type="number"
        className="field-input"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(event) => {
          const parsed = Number(event.target.value);
          if (Number.isFinite(parsed)) {
            onChange(parsed);
          }
        }}
      />
    </Field>
  );
}

function TextField({
  label,
  hint,
  value,
  onChange
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field label={label} hint={hint}>
      <input
        type="text"
        className="field-input"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </Field>
  );
}

function SelectField({
  label,
  hint,
  value,
  options,
  onChange
}: {
  label: string;
  hint?: string;
  value: string;
  options: readonly { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <Field label={label} hint={hint}>
      <select className="field-input" value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

function ToggleField({
  label,
  hint,
  checked,
  onChange
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="field toggle">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span className="field-label">{label}</span>
      {hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  );
}
