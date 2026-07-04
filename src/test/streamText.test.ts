import test from "node:test";
import assert from "node:assert/strict";
import { cleanStreamText, stripMarkedBlock, stripPageChrome, MARKER_START, MARKER_END } from "../webchat/streamText";

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

// The provider page renders a reasoning-status label INSIDE the reply container; .textContent
// scraping glues it onto the message with no separator ("Thought completedHey there!").
test("stripPageChrome removes a glued 'Thought completed' label", () => {
  assert.equal(stripPageChrome("Thought completedHey there! I'm ready to help."), "Hey there! I'm ready to help.");
});

test("stripPageChrome removes timed variants without eating the message", () => {
  assert.equal(stripPageChrome("Thought for 8 secondsHello!"), "Hello!");
  assert.equal(stripPageChrome("Reasoned for 2 minutes Sure — here's the plan."), "Sure — here's the plan.");
  assert.equal(stripPageChrome("Thinking completed. All done."), "All done.");
});

test("stripPageChrome handles stacked labels", () => {
  assert.equal(stripPageChrome("Show thinkingThought completedResult below."), "Result below.");
});

test("stripPageChrome leaves normal prose alone", () => {
  assert.equal(stripPageChrome("Thoughtful reply coming up."), "Thoughtful reply coming up.");
  assert.equal(stripPageChrome("Thought for you: use a set."), "Thought for you: use a set.");
  assert.equal(stripPageChrome("Thinking about your question, I'd say yes."), "Thinking about your question, I'd say yes.");
});

test("cleanStreamText and stripMarkedBlock apply the chrome strip", () => {
  const text = `Thought completedIntro prose.\n\n${block}\n\nAfter.`;
  assert.equal(stripMarkedBlock(text), "Intro prose.\n\nAfter.");
  assert.match(cleanStreamText("Thought completedStreaming now"), /^Streaming now/);
});
