import test from "node:test";
import assert from "node:assert/strict";
import { extractAgentJson, stripAgentBlock, maskStreamingBlock } from "../agent/responseFormat";
import { parseAgentResponse } from "../agent/toolProtocol";

// The exact shape DeepSeek returned in LeechCode: prose, then a ```json code block whose header
// buttons ("json"/"Copy"/"Download") got scraped into the text as "jsonCopyDownload", and NO
// <webchat_agent_response> markers.
const PROSE =
  "I'll explore the project structure to understand what we're working with, then look for any existing \"hey\" or greeting-related functionality that might need updating or fixing. Based on what I find, I'll propose appropriate changes.";
const JSON_BODY = [
  "{",
  '  "summary": "Initial exploration of the codebase.",',
  '  "files": [],',
  '  "tools": [',
  '    {"name": "read_file", "path": "README.md"},',
  '    {"name": "read_file", "path": "package.json"},',
  '    {"name": "search", "query": "hey|hello|greeting", "glob": "**/*.{ts,js,tsx,jsx}"}',
  "  ],",
  '  "nextSteps": ["Analyze results"]',
  "}"
].join("\n");
const DEEPSEEK = `${PROSE}jsonCopyDownload${JSON_BODY}`;

test("extractAgentJson finds fenced/scraped JSON without markers", () => {
  const json = extractAgentJson(DEEPSEEK);
  assert.ok(json, "should extract the JSON object");
  const parsed = JSON.parse(json!);
  assert.equal(parsed.summary, "Initial exploration of the codebase.");
  assert.equal(parsed.tools.length, 3);
});

test("parseAgentResponse parses tools from a DeepSeek-style fenced response (markers dropped)", () => {
  const response = parseAgentResponse(DEEPSEEK);
  assert.ok(response, "should parse");
  assert.equal(response!.tools.length, 3);
  assert.deepEqual(response!.tools.map((t) => t.name), ["read_file", "read_file", "search"]);
  // The glob with its own { } braces must not break the balanced-object scan.
  assert.equal((response!.tools[2] as { query: string }).query, "hey|hello|greeting");
});

test("stripAgentBlock returns only the prose — no JSON, no scraped 'jsonCopyDownload' header", () => {
  const out = stripAgentBlock(DEEPSEEK);
  assert.equal(out, PROSE);
  assert.ok(!out.includes("jsonCopyDownload"));
  assert.ok(!out.includes("summary"));
});

test("maskStreamingBlock hides the JSON as it streams (fenced, no markers)", () => {
  // Simulate the stream arriving in chunks; the JSON must never be shown once it starts.
  const upTo = DEEPSEEK.indexOf('"summary"') + 5;
  const mid = maskStreamingBlock(DEEPSEEK.slice(0, upTo));
  assert.ok(mid.includes("I'll explore the project structure"));
  assert.ok(!mid.includes("summary"), "raw JSON must not leak while streaming");
  assert.match(mid, /preparing file changes/);
});

test("bare JSON object (no fence, no markers) is still handled", () => {
  const bare = `Working on it.\n{"summary":"x","files":[],"tools":[{"name":"run","command":"npm test"}],"nextSteps":[]}`;
  const response = parseAgentResponse(bare);
  assert.equal(response!.tools.length, 1);
  assert.equal(stripAgentBlock(bare), "Working on it.");
});

test("plain prose with no block is untouched", () => {
  assert.equal(extractAgentJson("just a normal answer"), undefined);
  assert.equal(stripAgentBlock("just a normal answer"), "just a normal answer");
  assert.equal(maskStreamingBlock("just a normal answer"), "just a normal answer");
});

test("incidental JSON without our shape keys is not mistaken for a tool block", () => {
  const text = 'Here is an example config: {"port": 3000, "host": "localhost"} — use it.';
  assert.equal(extractAgentJson(text), undefined);
  assert.equal(stripAgentBlock(text), text);
});
