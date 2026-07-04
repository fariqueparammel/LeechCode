import type { ReactNode } from "react";
import type { BridgeStatusInfo, ProviderInfo, WebChatSettings } from "../src/webview/messages";
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
