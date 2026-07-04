// Turn the raw assistant DOM text into human-facing chat text, hiding the tool-response JSON block.
// The hard work (locating the block whether it's marker-wrapped, ```json-fenced, or bare, and
// stripping scraped code-block header artifacts) lives in ../agent/responseFormat so it's shared with
// the parser and unit-tested. Kept as a thin, stable wrapper for the controller + tests.

import { maskStreamingBlock, stripAgentBlock, MARKER_START, MARKER_END } from "../agent/responseFormat";

export { MARKER_START, MARKER_END };

/**
 * Reasoning-status labels that chat pages render INSIDE the reply container ("Thought completed",
 * "Thought for 8 seconds", "Show thinking", …). `.textContent` scraping glues them straight onto
 * the real message with no separator, so they must be stripped from the display text. Patterns are
 * anchored to the start and use bounded matches only — there is no newline between label and prose,
 * so a greedy match would eat the message itself.
 */
const PAGE_CHROME_PATTERNS: readonly RegExp[] = [
  /^\s*(?:thought|thinking|reasoning)\s+completed\.?/i,
  /^\s*(?:finished|done)\s+(?:thinking|reasoning)\.?/i,
  /^\s*(?:thought|reasoned|thinking)\s+for\s+(?:a\s+few\s+|\d+(?:\.\d+)?\s*)(?:seconds?|minutes?|hours?|[smh]\b)/i,
  /^\s*(?:show|hide)\s+(?:thinking|reasoning)\.?/i,
  /^\s*thinking(?:\.{2,3}|…)/i,
  /^\s*deep\s*think(?:ing)?\s+completed\.?/i
];

/** Remove leading page-chrome labels (possibly stacked) from scraped assistant text. */
export function stripPageChrome(text: string): string {
  let out = text;
  for (let pass = 0; pass < 4; pass += 1) {
    const before = out;
    for (const pattern of PAGE_CHROME_PATTERNS) {
      out = out.replace(pattern, "");
    }
    if (out === before) {
      break;
    }
  }
  return out.replace(/^\s+/, "");
}

/** Final, done-state display text: prose around the tool block, JSON removed, page chrome stripped. */
export function stripMarkedBlock(text: string): string {
  return stripAgentBlock(stripPageChrome(text));
}

/** Live streaming display text: prose so far, hiding the (possibly partial) tool block + page chrome. */
export function cleanStreamText(text: string): string {
  return maskStreamingBlock(stripPageChrome(text));
}
