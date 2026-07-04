// Headless demonstration of the streaming fix + the coder tool suite, using the compiled modules.
// It proves: (1) the agent instructions now require a plain-language explanation BEFORE the JSON
// block, (2) that prose streams to the panel live (instead of only a "…preparing…" placeholder),
// (3) the JSON block is parsed into structured tools (read_file/run/spawn_subagent), and (4) the
// final display keeps the prose and hides the raw JSON.
//
// Run: node scripts/verify-tooling.mjs   (after `pnpm run compile`)

import assert from "node:assert/strict";
import { buildAgentToolInstructions, parseAgentResponse } from "../dist/agent/toolProtocol.js";
import { cleanStreamText, stripMarkedBlock } from "../dist/webchat/streamText.js";

function log(ok, msg) {
  console.log(`${ok ? "  ✓" : "  ✗"} ${msg}`);
}

// 1) The instructions demand prose-first + advertise the full toolbelt.
const instructions = buildAgentToolInstructions({
  maxContextTokens: 150000,
  compactEveryPrompts: 5,
  action: "continue",
  mode: "auto"
});
assert.match(instructions, /Begin your reply with .* explaining what you are about to do/);
for (const tool of ["read_file", "list_dir", "search", "\"run\"", "spawn_subagent"]) {
  assert.match(instructions, new RegExp(tool));
}
log(true, "Instructions require streamed prose first and advertise read_file/list_dir/search/run/spawn_subagent.");

// A subagent turn must not be told it can spawn more subagents (depth cap).
const nested = buildAgentToolInstructions({ maxContextTokens: 1000, compactEveryPrompts: 5, action: "continue", mode: "auto", allowSubagents: false });
assert.doesNotMatch(nested, /spawn_subagent/);
log(true, "Depth cap: a subagent's own instructions omit spawn_subagent.");

// 2) A well-behaved reply that follows the instruction (prose, THEN the marked block).
const reply = [
  "I'll add an iterative factorial to factorial.py, then run the tests to confirm it works.",
  "",
  "<webchat_agent_response>",
  JSON.stringify(
    {
      summary: "Added iterative factorial() + a quick test.",
      files: [{ path: "factorial.py", action: "write", contentBase64: Buffer.from("def factorial(n):\n    r = 1\n    for i in range(2, n + 1):\n        r *= i\n    return r\n").toString("base64") }],
      tools: [
        { name: "read_file", path: "factorial.py" },
        { name: "run", command: "python -m pytest -q" },
        { name: "spawn_subagent", task: "write unit tests for factorial()", context: ["factorial.py"] }
      ],
      nextSteps: ["Review the diff"]
    },
    null,
    0
  ),
  "</webchat_agent_response>"
].join("\n");

// 3) Simulate the browser streaming the reply character-block by block; the panel should show the
//    prose building up, NOT jump straight to the placeholder.
let sawStreamedProse = false;
for (let i = 10; i <= reply.length; i += 40) {
  const shown = cleanStreamText(reply.slice(0, i));
  if (shown.includes("I'll add an iterative factorial") && !shown.includes("preparing")) {
    sawStreamedProse = true;
  }
}
assert.ok(sawStreamedProse, "the explanation prose must stream to the panel before the JSON block starts");
log(true, "Streaming: the model's plain-language explanation streams into the panel live.");

// Once the JSON block opens mid-stream, raw JSON must never be shown.
const midBlock = cleanStreamText(reply.slice(0, reply.indexOf("summary") + 3));
assert.ok(!midBlock.includes("summary"), "raw JSON must never leak into the streamed text");
assert.match(midBlock, /preparing file changes/);
log(true, "Streaming: the raw JSON tool block is hidden ('…preparing file changes…').");

// 4) Parse into structured tools + files.
const parsed = parseAgentResponse(reply);
assert.equal(parsed.files.length, 1);
assert.equal(parsed.files[0].path, "factorial.py");
assert.equal(parsed.tools.length, 3);
assert.deepEqual(parsed.tools.map((t) => t.name), ["read_file", "run", "spawn_subagent"]);
log(true, `Parsed 1 file change + ${parsed.tools.length} tools (${parsed.tools.map((t) => t.name).join(", ")}).`);

// 5) Final display keeps prose, hides JSON.
const done = stripMarkedBlock(reply);
assert.equal(done, "I'll add an iterative factorial to factorial.py, then run the tests to confirm it works.");
log(true, "Done view keeps the explanation and hides the JSON block.");

console.log("\n✅ Streaming + coder-tool-suite verification PASSED.\n");
