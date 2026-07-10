#!/usr/bin/env node
// LeechCode headless loop driver.
//
// Drives the REAL agent pipeline without an IDE or a browser: it starts the actual
// LocalBridgeServer (dist/bridge), attaches a simulated browser over a real WebSocket, and scripts
// the "LLM" reply (prose + a valid <webchat_agent_response> block, streamed as chat.stream.delta /
// chat.stream.done — including ACK replies for chunked-index messages). Input goes through the
// server's real `POST /prompt` endpoint; every envelope that flows is printed.
//
//   node .claude/skills/run-leechcode/driver.mjs demo    # one-shot: send a prompt, assert the
//                                                        # round trip parses to a file write
//   node .claude/skills/run-leechcode/driver.mjs serve   # keep running; drive it with curl
//
// Requires `pnpm run compile` first (imports from dist/). Default port 53461 — deliberately NOT
// 53451, so it never collides with a live IDE's bridge.

import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

const { LocalBridgeServer } = require(path.join(ROOT, "dist", "bridge", "localBridgeServer.js"));
const { createEnvelope } = require(path.join(ROOT, "dist", "bridge", "protocol.js"));
const { parseAgentResponse } = require(path.join(ROOT, "dist", "agent", "toolProtocol.js"));

const PORT = Number(process.env.LEECH_DRIVER_PORT || 53461);
const TOKEN = process.env.LEECH_DRIVER_TOKEN || "driver-token";
const SESSION = "run-leechcode-driver";
const mode = process.argv[2] || "demo";

function log(tag, text) {
  console.log(`[${tag}] ${text}`);
}

/** The scripted "LLM": returns the full reply text for a received prompt. */
function scriptedReply(prompt) {
  // Chunked-index priming messages just get the positional ACK the controller waits for.
  const ack = prompt.match(/<webchat_codebase_index part="(\d+)" of="(\d+)">/);
  if (ack) {
    return `ACK ${ack[1]}/${ack[2]}`;
  }
  const taskLine = (prompt.match(/User task:\n([^\n]*)/) || [])[1] || "your request";
  const content = Buffer.from(
    `Hello from the LeechCode driver!\nTask that produced this file: ${taskLine}\n`,
    "utf8"
  ).toString("base64");
  const block = {
    summary: `Demo turn — wrote demo-output/hello.txt for: ${taskLine}`,
    files: [{ path: "demo-output/hello.txt", action: "write", contentBase64: content }],
    tools: [],
    nextSteps: ["Inspect demo-output/hello.txt"]
  };
  return [
    "I'll create a small demo file for that, then hand it back to the IDE to apply.",
    "",
    "<webchat_agent_response>",
    JSON.stringify(block),
    "</webchat_agent_response>"
  ].join("\n");
}

async function main() {
  const server = new LocalBridgeServer({ port: PORT, token: TOKEN, sessionId: SESSION });

  const finished = { fullText: "", done: false };
  server.onMessage((envelope) => {
    if (envelope.type === "chat.stream.delta") {
      log("delta", JSON.stringify(envelope.payload.text));
    } else if (envelope.type === "chat.stream.done") {
      finished.fullText = envelope.payload.fullText;
      finished.done = true;
      log("done", `${envelope.payload.fullText.length} chars, finishReason=${envelope.payload.finishReason}`);
    } else if (envelope.type !== "bridge.status") {
      log("event", envelope.type);
    }
  });

  await server.start();
  log("bridge", `real LocalBridgeServer listening on 127.0.0.1:${PORT} (token: ${TOKEN})`);

  // ---- simulated browser: a real WebSocket client that plays the provider page + LLM ----------
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/?token=${encodeURIComponent(TOKEN)}`);
  const paired = new Promise((resolve) => {
    ws.addEventListener("message", (event) => {
      const envelope = JSON.parse(String(event.data));
      if (envelope.type === "pair.accepted") {
        resolve();
        return;
      }
      if (envelope.type !== "chat.prompt") {
        return;
      }
      const reply = scriptedReply(envelope.payload.prompt);
      log("browser", `received chat.prompt (${envelope.payload.prompt.length} chars) — streaming scripted reply`);
      // Stream the reply the way content.js does: cumulative fullText deltas, then done.
      const step = Math.max(1, Math.ceil(reply.length / 4));
      let sent = 0;
      const interval = setInterval(() => {
        const next = Math.min(reply.length, sent + step);
        ws.send(
          JSON.stringify(
            createEnvelope({
              id: `delta-${next}`,
              sessionId: SESSION,
              type: "chat.stream.delta",
              payload: { providerId: "mock", text: reply.slice(sent, next), fullText: reply.slice(0, next) }
            })
          )
        );
        sent = next;
        if (sent >= reply.length) {
          clearInterval(interval);
          ws.send(
            JSON.stringify(
              createEnvelope({
                id: "done",
                sessionId: SESSION,
                type: "chat.stream.done",
                payload: { providerId: "mock", fullText: reply, finishReason: "complete" }
              })
            )
          );
        }
      }, 60);
    });
  });
  await paired;
  log("browser", "simulated browser paired over a real WebSocket");

  if (mode === "serve") {
    console.log("\nDrive it, e.g.:");
    console.log(
      `  curl -s -X POST 'http://127.0.0.1:${PORT}/prompt?token=${TOKEN}' -H 'Content-Type: application/json' \\\n` +
        `    --data '{"providerId":"mock","chatUrl":"http://127.0.0.1:53452/","prompt":"User task:\\nsay hi","promptNumber":1,"expectedAction":"submit","autoSubmit":true}'`
    );
    console.log("\nCtrl-C to stop.");
    return; // keep process alive (server + ws hold the loop open)
  }

  // ---- demo: one full round trip, then assert the parse ---------------------------------------
  const prompt = "User task:\ncreate a hello file via the LeechCode demo driver";
  const response = await fetch(`http://127.0.0.1:${PORT}/prompt?token=${TOKEN}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      providerId: "mock",
      chatUrl: "http://127.0.0.1:53452/",
      prompt,
      promptNumber: 1,
      expectedAction: "submit",
      autoSubmit: true
    })
  });
  const body = await response.json();
  if (response.status !== 200 || body.sent !== 1) {
    throw new Error(`POST /prompt failed: HTTP ${response.status}, sent=${body.sent}`);
  }
  log("ide", "prompt accepted by the real POST /prompt endpoint (sent to 1 browser client)");

  const deadline = Date.now() + 10_000;
  while (!finished.done && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 50));
  }
  if (!finished.done) {
    throw new Error("no chat.stream.done within 10s");
  }

  const parsed = parseAgentResponse(finished.fullText);
  if (!parsed || parsed.files.length !== 1 || parsed.files[0].path !== "demo-output/hello.txt") {
    throw new Error(`parseAgentResponse did not yield the expected file write: ${JSON.stringify(parsed)}`);
  }
  log("parse", `real parser extracted ${parsed.files.length} file write → ${parsed.files[0].path}`);
  log("parse", `file content: ${JSON.stringify(parsed.files[0].content.split("\n")[0])}…`);

  console.log("\n✅ DEMO PASSED — full loop: POST /prompt → real bridge → simulated browser/LLM → streamed deltas → real parser → file write extracted.");
  ws.close();
  server.dispose();
  process.exit(0);
}

main().catch((error) => {
  console.error(`\n❌ driver failed: ${error?.message || error}`);
  process.exit(1);
});
