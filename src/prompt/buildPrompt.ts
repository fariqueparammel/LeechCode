import type { BuildPromptInput, PromptFile } from "./types";

export function buildPrompt(input: BuildPromptInput): string {
  const providerLine = input.provider ? `Target web chat: ${input.provider.label}` : "Target web chat: any";
  const files = input.files.map(formatFile).join("\n\n");

  return [
    "<webchat_request>",
    `  <meta>${escapeXml(providerLine)}</meta>`,
    "  <instruction>",
    indent(wrapCdata(input.instruction), 4),
    "  </instruction>",
    "  <files>",
    files || "    <empty />",
    "  </files>",
    "</webchat_request>"
  ].join("\n");
}

function formatFile(file: PromptFile): string {
  const language = file.languageId ? ` language="${escapeXml(file.languageId)}"` : "";

  return [
    `    <file path="${escapeXml(file.path)}"${language}>`,
    wrapCdata(file.content),
    "    </file>"
  ].join("\n");
}

function indent(value: string, spaces: number): string {
  const prefix = " ".repeat(spaces);
  return value.split("\n").map((line) => `${prefix}${line}`).join("\n");
}

/** Wrap arbitrary text in CDATA, splitting any nested `]]>` so it cannot terminate the block early. */
export function wrapCdata(content: string): string {
  return `<![CDATA[\n${content.replaceAll("]]>", "]]]]><![CDATA[>")}\n]]>`;
}

export function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}
