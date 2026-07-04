// Robustly locate the agent's tool-response JSON in an assistant message, tolerant of how different
// providers/models format it. We ask for a `<webchat_agent_response>…</webchat_agent_response>`
// marked block, but models drift: some wrap the JSON in a ```json markdown fence and drop the
// markers (DeepSeek), some emit bare JSON. This module finds the block regardless, and computes the
// span so the streamed panel can hide the raw JSON in every case. Pure (no vscode / DOM).

export const MARKER_START = "<webchat_agent_response>";
export const MARKER_END = "</webchat_agent_response>";

/** Keys that identify our tool-response object (distinguishes it from incidental JSON in prose). */
const SHAPE_KEYS = ["summary", "files", "tools", "commands", "nextSteps"];

/** Scan a balanced JSON object starting at text[start] === "{". Returns end index (exclusive) or -1. */
function balancedEnd(text: string, start: number): number {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i += 1) {
    const c = text[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (c === "\\") {
        escaped = true;
      } else if (c === '"') {
        inString = false;
      }
    } else if (c === '"') {
      inString = true;
    } else if (c === "{") {
      depth += 1;
    } else if (c === "}") {
      depth -= 1;
      if (depth === 0) {
        return i + 1;
      }
    }
  }
  return -1;
}

function looksLikeAgentJson(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    SHAPE_KEYS.some((key) => key in (value as Record<string, unknown>))
  );
}

/** First balanced, parseable `{…}` in `text` that has our tool-response shape. */
function findAgentObject(text: string): { start: number; end: number; json: string } | undefined {
  let idx = text.indexOf("{");
  while (idx !== -1) {
    const end = balancedEnd(text, idx);
    if (end === -1) {
      return undefined; // an object is open but not yet closed (still streaming)
    }
    const json = text.slice(idx, end);
    try {
      if (looksLikeAgentJson(JSON.parse(json))) {
        return { start: idx, end, json };
      }
    } catch {
      // not valid JSON — keep scanning
    }
    idx = text.indexOf("{", end);
  }
  return undefined;
}

/** Extract the tool-response JSON string: markers first, then a fenced/bare shape object. */
export function extractAgentJson(text: string): string | undefined {
  const start = text.indexOf(MARKER_START);
  if (start !== -1) {
    const end = text.indexOf(MARKER_END, start + MARKER_START.length);
    if (end !== -1) {
      const inner = text.slice(start + MARKER_START.length, end).trim();
      // The inner content may itself be fenced (```json {…} ```) — pull the object out if so.
      const obj = findAgentObject(inner);
      return obj ? obj.json : inner;
    }
  }
  const found = findAgentObject(text);
  return found?.json;
}

/** Trailing partial copy of MARKER_START at the end of `text` (e.g. "<webchat_agent_re"), or -1. */
function partialMarkerTail(text: string): number {
  for (let p = text.length - 1; p >= 0 && text.length - p <= MARKER_START.length; p -= 1) {
    const tail = text.slice(p);
    if (tail.length >= 3 && MARKER_START.startsWith(tail)) {
      return p;
    }
  }
  return -1;
}


/**
 * Extend a block-start index backwards over an immediately-preceding code-fence header, whether it's
 * a literal ```json fence OR the browser-rendered header text a page's code block shows (the "json"
 * language label + "Copy"/"Download" buttons, which get scraped into the assistant text as
 * "jsonCopyDownload"). Strips those so they don't leak into the displayed prose.
 */
function withLeadingFence(text: string, start: number): number {
  const before = text.slice(0, start);
  const literal = before.match(/```(?:json)?[ \t]*\n?[ \t]*$/i);
  if (literal) {
    return before.length - literal[0].length;
  }
  const scraped = before.match(/(?:\bjson)?[ \t\n]*(?:copy)?[ \t\n]*(?:download)?[ \t\n]*$/i);
  if (scraped && scraped[0] && /copy|download/i.test(scraped[0])) {
    return before.length - scraped[0].length;
  }
  return start;
}

/** The index where an actually-started tool block begins (full marker, fence+object, or bare object), or -1. */
export function openBlockStart(text: string): number {
  const marker = text.indexOf(MARKER_START);
  if (marker !== -1) {
    return marker;
  }
  // A `{` that is EITHER preceded by a code-fence / scraped header, OR already shows a shape key.
  let idx = text.indexOf("{");
  while (idx !== -1) {
    const withFence = withLeadingFence(text, idx);
    if (withFence !== idx) {
      return withFence; // fenced/headered block — a tool block even before the first key streams
    }
    const window = text.slice(idx, idx + 500);
    if (SHAPE_KEYS.some((key) => window.includes(`"${key}"`))) {
      return idx;
    }
    idx = text.indexOf("{", idx + 1);
  }
  return -1;
}

/** The full [start, end) span of a CLOSED tool block (incl. wrapping markers/fence), or null. */
export function agentBlockSpan(text: string): { start: number; end: number } | null {
  const marker = text.indexOf(MARKER_START);
  if (marker !== -1) {
    const end = text.indexOf(MARKER_END, marker + MARKER_START.length);
    return end === -1 ? null : { start: marker, end: end + MARKER_END.length };
  }
  const found = findAgentObject(text);
  if (!found) {
    return null;
  }
  const start = withLeadingFence(text, found.start);
  const afterMatch = text.slice(found.end).match(/^[ \t]*\n?[ \t]*```/);
  const end = afterMatch ? found.end + afterMatch[0].length : found.end;
  return { start, end };
}

/** Prose with the tool block removed (done-state display). */
export function stripAgentBlock(text: string): string {
  const span = agentBlockSpan(text);
  if (span) {
    const before = text.slice(0, span.start).trim();
    const after = text.slice(span.end).trim();
    return [before, after].filter(Boolean).join("\n\n").trim();
  }
  // An open/partial block (still streaming) — cut from where it starts.
  const start = openBlockStart(text);
  if (start !== -1) {
    return text.slice(0, start).trim();
  }
  const partial = partialMarkerTail(text);
  return (partial === -1 ? text : text.slice(0, partial)).trim();
}

/** Live streaming display: prose so far, hiding the (possibly partial) tool block. */
export function maskStreamingBlock(text: string): string {
  const span = agentBlockSpan(text);
  if (span) {
    // Block already closed — show prose before + any trailing prose after.
    const before = text.slice(0, span.start).trim();
    const after = text.slice(span.end).trim();
    return [before, after].filter(Boolean).join("\n\n").trim();
  }
  const start = openBlockStart(text);
  if (start !== -1) {
    const before = text.slice(0, start).trim();
    return before ? `${before}\n\n…preparing file changes…` : "…preparing file changes…";
  }
  // Only a partial opening marker at the tail — hide it, no placeholder yet.
  const partial = partialMarkerTail(text);
  return partial === -1 ? text : text.slice(0, partial).trim();
}
