// Pure decision logic for the chunked-index delivery gate. While an index is being delivered, every
// inbound bridge message is routed through decideIndexTurn() to decide whether it releases the
// sequential sender for the next chunk, is a stale ack to swallow, means we should abort, or is
// irrelevant. Kept pure (no timers/emitters) so the tricky late-ack cascade case is unit-testable.

export type IndexTurnDecision =
  | "release" // this is the acknowledgement for the current chunk — send the next one
  | "swallow-late" // a real ack for a chunk we already timed out past — ignore it, don't advance
  | "abort" // the page can't accept more chunks (login/limit/blocked) — stop the whole delivery
  | "ignore"; // unrelated message (streaming state, delta, etc.)

/**
 * @param messageType  bridge envelope type
 * @param payload      the envelope payload (only inspected for chat.state)
 * @param pendingLateAcks  count of chunks whose timeout fired before their real done arrived
 */
export function decideIndexTurn(
  messageType: string,
  payload: unknown,
  pendingLateAcks: number
): IndexTurnDecision {
  if (messageType === "chat.state" && isBlockingState(payload)) {
    return "abort";
  }
  if (messageType === "chat.stream.done" || messageType === "chat.error") {
    return pendingLateAcks > 0 ? "swallow-late" : "release";
  }
  return "ignore";
}

/** A chat.state that means the page can't accept further chunks (login wall, rate limit, stuck). */
export function isBlockingState(payload: unknown): boolean {
  const state = (payload as { state?: unknown } | null)?.state;
  return state === "blocked" || state === "limit-hit" || state === "login-required";
}
