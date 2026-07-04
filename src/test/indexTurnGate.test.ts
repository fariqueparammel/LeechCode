import test from "node:test";
import assert from "node:assert/strict";
import { decideIndexTurn, isBlockingState } from "../webchat/indexTurnGate";

test("a stream.done with no pending late acks releases the next chunk", () => {
  assert.equal(decideIndexTurn("chat.stream.done", { fullText: "ACK 1/5" }, 0), "release");
});

test("chat.error is treated as a turn-ending release too", () => {
  assert.equal(decideIndexTurn("chat.error", { message: "boom" }, 0), "release");
});

test("a late ack (timeout already advanced) is swallowed, not a release", () => {
  // The chunk timed out and the sender moved on (pendingLateAcks=1); its real done now arrives.
  assert.equal(decideIndexTurn("chat.stream.done", { fullText: "ACK 2/5" }, 1), "swallow-late");
});

test("the late-ack cascade is contained: one timeout => exactly one swallow, then normal release", () => {
  // Model of the controller's counter across a timeout + the late done + the next chunk's done.
  let pending = 0;
  // chunk k times out -> sender advances, remembers one late ack is coming
  pending += 1;
  // k's real done finally arrives -> must be swallowed (would otherwise release k+1 early)
  const d1 = decideIndexTurn("chat.stream.done", { fullText: "ACK k" }, pending);
  assert.equal(d1, "swallow-late");
  if (d1 === "swallow-late") pending -= 1;
  // k+1's genuine done -> now a real release
  const d2 = decideIndexTurn("chat.stream.done", { fullText: "ACK k+1" }, pending);
  assert.equal(d2, "release");
  assert.equal(pending, 0);
});

test("blocking page states abort the whole delivery", () => {
  for (const state of ["blocked", "limit-hit", "login-required"]) {
    assert.equal(decideIndexTurn("chat.state", { state }, 0), "abort", `${state} should abort`);
  }
});

test("benign states and deltas are ignored", () => {
  assert.equal(decideIndexTurn("chat.state", { state: "streaming" }, 0), "ignore");
  assert.equal(decideIndexTurn("chat.state", { state: "ready" }, 0), "ignore");
  assert.equal(decideIndexTurn("chat.stream.delta", { text: "…" }, 0), "ignore");
});

test("isBlockingState only flags terminal-bad states", () => {
  assert.ok(isBlockingState({ state: "blocked" }));
  assert.ok(isBlockingState({ state: "limit-hit" }));
  assert.ok(!isBlockingState({ state: "streaming" }));
  assert.ok(!isBlockingState(null));
  assert.ok(!isBlockingState(undefined));
});
