import test from "node:test";
import assert from "node:assert/strict";
import { cleanStreamText, stripMarkedBlock, MARKER_START, MARKER_END } from "../webchat/streamText";

const block = `${MARKER_START}\n{"summary":"s","files":[]}\n${MARKER_END}`;

test("stripMarkedBlock keeps prose before and after the tool block, dropping the JSON", () => {
  const text = `Here is the plan.\n\n${block}\n\nDone — let me know.`;
  const out = stripMarkedBlock(text);
  assert.equal(out, "Here is the plan.\n\nDone — let me know.");
  assert.ok(!out.includes("summary"), "raw JSON must not leak into display text");
});

test("stripMarkedBlock returns trimmed text when there is no block", () => {
  assert.equal(stripMarkedBlock("  just prose  "), "just prose");
});

test("cleanStreamText shows only prose while the block is still open", () => {
  const streaming = `Working on it…\n\n${MARKER_START}\n{"summary":"partial`;
  const out = cleanStreamText(streaming);
  assert.match(out, /Working on it…/);
  assert.match(out, /preparing file changes/);
  assert.ok(!out.includes("summary"), "must not reveal the partial JSON");
});

test("cleanStreamText hides a partially-streamed opening marker", () => {
  const partial = `Almost there <webchat_agent_res`;
  const out = cleanStreamText(partial);
  assert.equal(out, "Almost there");
});

test("cleanStreamText streams trailing prose once the block has closed", () => {
  const text = `Intro.\n\n${block}\n\nHere are the next steps.`;
  const out = cleanStreamText(text);
  assert.equal(out, "Intro.\n\nHere are the next steps.");
});

test("cleanStreamText passes plain prose through unchanged", () => {
  assert.equal(cleanStreamText("no markers here"), "no markers here");
});

test("markers are the documented tokens", () => {
  assert.equal(MARKER_START, "<webchat_agent_response>");
  assert.equal(MARKER_END, "</webchat_agent_response>");
});
