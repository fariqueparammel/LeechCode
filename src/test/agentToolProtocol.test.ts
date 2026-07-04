import test from "node:test";
import assert from "node:assert/strict";
import { buildAgentResponseRepairPrompt, buildAgentToolInstructions, parseAgentResponse } from "../agent/toolProtocol";

test("parseAgentResponse reads marked JSON file changes", () => {
  const response = parseAgentResponse([
    "Done.",
    "<webchat_agent_response>",
    "{",
    "  \"summary\": \"Created the app shell.\",",
    "  \"files\": [",
    "    {\"path\":\"demo/app/index.html\",\"action\":\"write\",\"content\":\"<main>Hello</main>\"},",
    "    {\"path\":\"demo/app/old.txt\",\"action\":\"delete\"}",
    "  ],",
    "  \"nextSteps\": [\"Open the app\"]",
    "}",
    "</webchat_agent_response>"
  ].join("\n"));

  assert.deepEqual(response, {
    summary: "Created the app shell.",
    files: [
      {
        path: "demo/app/index.html",
        action: "write",
        content: "<main>Hello</main>"
      },
      {
        path: "demo/app/old.txt",
        action: "delete"
      }
    ],
    commands: [],
    tools: [],
    nextSteps: ["Open the app"]
  });
});

test("parseAgentResponse reads requested commands", () => {
  const response = parseAgentResponse([
    "<webchat_agent_response>",
    "{",
    "  \"summary\": \"Run the tests.\",",
    "  \"files\": [],",
    "  \"commands\": [\"npm install\", \"npm test\", \"   \"],",
    "  \"nextSteps\": []",
    "}",
    "</webchat_agent_response>"
  ].join("\n"));

  assert.deepEqual(response?.commands, ["npm install", "npm test"]);
});

test("buildAgentToolInstructions teaches the tool loop and respects plan mode", () => {
  const editPrompt = buildAgentToolInstructions({
    maxContextTokens: 1000,
    compactEveryPrompts: 5,
    action: "continue",
    mode: "ask"
  });
  assert.match(editPrompt, /read_file/);
  assert.match(editPrompt, /list_dir/);
  assert.match(editPrompt, /search/);
  assert.match(editPrompt, /"run"/);
  assert.match(editPrompt, /spawn_subagent/);
  // Streaming fix: the model is told to stream a plain-language explanation before the JSON block.
  assert.match(editPrompt, /Begin your reply with/);

  const planPrompt = buildAgentToolInstructions({
    maxContextTokens: 1000,
    compactEveryPrompts: 5,
    action: "continue",
    mode: "plan"
  });
  assert.match(planPrompt, /must NOT run shell commands or edit files/);
});

test("buildAgentToolInstructions hides spawn_subagent when subagents are disallowed (depth cap)", () => {
  const nested = buildAgentToolInstructions({
    maxContextTokens: 1000,
    compactEveryPrompts: 5,
    action: "continue",
    mode: "auto",
    allowSubagents: false
  });
  assert.doesNotMatch(nested, /spawn_subagent/);
  assert.match(nested, /read_file/); // other tools still offered
});

test("parseAgentResponse parses structured tools and folds legacy commands into run tools", () => {
  const response = parseAgentResponse([
    "<webchat_agent_response>",
    "{",
    "  \"summary\": \"Explore then test.\",",
    "  \"files\": [],",
    "  \"tools\": [",
    "    {\"name\":\"read_file\",\"path\":\"src/app.ts\"},",
    "    {\"name\":\"search\",\"query\":\"TODO\",\"glob\":\"**/*.ts\"},",
    "    {\"name\":\"spawn_subagent\",\"task\":\"write tests\",\"context\":[\"src/app.ts\"]}",
    "  ],",
    "  \"commands\": [\"npm test\"],",
    "  \"nextSteps\": []",
    "}",
    "</webchat_agent_response>"
  ].join("\n"));

  assert.equal(response?.tools.length, 4); // 3 structured + 1 folded-in run
  assert.deepEqual(response?.tools[0], { name: "read_file", path: "src/app.ts", startLine: undefined, endLine: undefined });
  assert.equal(response?.tools[3]?.name, "run");
  assert.equal((response?.tools[3] as { command: string }).command, "npm test");
});

test("parseAgentResponse drops invalid tool entries", () => {
  const response = parseAgentResponse([
    "<webchat_agent_response>",
    "{",
    "  \"summary\": \"x\", \"files\": [],",
    "  \"tools\": [{\"name\":\"read_file\"}, {\"name\":\"bogus\"}, {\"name\":\"run\",\"command\":\"ls\"}],",
    "  \"nextSteps\": []",
    "}",
    "</webchat_agent_response>"
  ].join("\n"));

  assert.equal(response?.tools.length, 1);
  assert.equal(response?.tools[0]?.name, "run");
});

test("parseAgentResponse decodes base64 write content", () => {
  const response = parseAgentResponse([
    "<webchat_agent_response>",
    "{",
    "  \"summary\": \"Created encoded file.\",",
    "  \"files\": [",
    "    {\"path\":\"demo/app/index.html\",\"action\":\"write\",\"contentBase64\":\"PG1haW4+SGVsbG88L21haW4+\"}",
    "  ],",
    "  \"nextSteps\": []",
    "}",
    "</webchat_agent_response>"
  ].join("\n"));

  assert.equal(response?.files[0]?.content, "<main>Hello</main>");
});

test("parseAgentResponse accepts one file object and one next step string", () => {
  const response = parseAgentResponse([
    "<webchat_agent_response>",
    "{",
    "  \"summary\": \"Created encoded file.\",",
    "  \"files\": {\"path\":\"demo/app/index.html\",\"action\":\"write\",\"contentBase64\":\"PG1haW4+SGVsbG88L21haW4+\"},",
    "  \"nextSteps\": \"Open the app\"",
    "}",
    "</webchat_agent_response>"
  ].join("\n"));

  assert.deepEqual(response?.nextSteps, ["Open the app"]);
  assert.equal(response?.files.length, 1);
  assert.equal(response?.files[0]?.content, "<main>Hello</main>");
});

test("buildAgentToolInstructions includes context limits and rotation state", () => {
  const prompt = buildAgentToolInstructions({
    maxContextTokens: 42000,
    compactEveryPrompts: 3,
    action: "rotate",
    previousSummary: "Existing plan"
  });

  assert.match(prompt, /Configured total context limit: 42000/);
  assert.match(prompt, /Current session action: rotate/);
  assert.match(prompt, /Existing plan/);
  assert.match(prompt, /<webchat_agent_response>/);
  assert.match(prompt, /contentBase64/);
});

test("buildAgentResponseRepairPrompt asks for parseable base64 JSON", () => {
  const prompt = buildAgentResponseRepairPrompt({
    parseError: "Unexpected token",
    invalidResponse: "<webchat_agent_response>{bad}</webchat_agent_response>"
  });

  assert.match(prompt, /Unexpected token/);
  assert.match(prompt, /contentBase64/);
  assert.match(prompt, /JSON\.parse/);
  assert.match(prompt, /<webchat_agent_response>/);
});
