// Turn the raw assistant DOM text into human-facing chat text, hiding the tool-response JSON block.
// The hard work (locating the block whether it's marker-wrapped, ```json-fenced, or bare, and
// stripping scraped code-block header artifacts) lives in ../agent/responseFormat so it's shared with
// the parser and unit-tested. Kept as a thin, stable wrapper for the controller + tests.

import { maskStreamingBlock, stripAgentBlock, MARKER_START, MARKER_END } from "../agent/responseFormat";

export { MARKER_START, MARKER_END };

/** Final, done-state display text: prose around the tool block, JSON removed. */
export function stripMarkedBlock(text: string): string {
  return stripAgentBlock(text);
}

/** Live streaming display text: prose so far, hiding the (possibly partial) tool block. */
export function cleanStreamText(text: string): string {
  return maskStreamingBlock(text);
}
