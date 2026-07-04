// End-to-end verification of chunked codebase indexing over the REAL local bridge.
//
// This exercises the actual compiled bridge server (dist/bridge) and the actual chunker
// (dist/prompt/indexChunker) with a simulated browser WebSocket client that acknowledges each
// chunk — reproducing the controller's sequential "send chunk, wait for the chat to answer, send
// the next" loop without needing the VS Code host. It asserts:
//   • the index is split into ordered, paste-safe messages (each <= the per-message limit),
//   • a large file is split across messages with part="k/n" markers,
//   • the sender never sends chunk N+1 before chunk N is acknowledged (ack-gating),
//   • a final task message follows the priming chunks, carrying the "codebase primed" note.
//
// Run: node scripts/verify-chunked-index.mjs   (after `pnpm run compile`)

import { createServer } from "node:net";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

import { LocalBridgeServer } from "../dist/bridge/localBridgeServer.js";
import { createEnvelope } from "../dist/bridge/protocol.js";
import { planIndexChunks, buildIndexPrimedNote } from "../dist/prompt/indexChunker.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const MAX_CHARS = 4000; // small per-message limit to force several chunks
const TOKEN = "verify-token";
const SESSION_ID = "verify-session";
const CHUNK_TIMEOUT_MS = 8000;
const ACK_DELAY_MS = 15; // fake-browser "read then ack" delay; keep the whole run well under a second

function walk(dir, acc) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, acc);
    } else if (/\.(ts|js|json)$/.test(entry.name)) {
      acc.push(full);
    }
  }
  return acc;
}

function gatherFiles() {
  const roots = [path.join(repoRoot, "src"), path.join(repoRoot, "browser-extension", "src")];
  const paths = [];
  for (const root of roots) {
    try {
      walk(root, paths);
    } catch {
      /* ignore missing */
    }
  }
  const rels = paths
    .map((p) => path.relative(repoRoot, p).split(path.sep).join("/"))
    .sort((a, b) => a.localeCompare(b));

  const files = [{ path: "WORKSPACE_FILE_TREE.txt", content: rels.join("\n") }];
  for (const rel of rels) {
    try {
      const abs = path.join(repoRoot, rel);
      if (statSync(abs).size > 200000) continue;
      files.push({ path: rel, content: readFileSync(abs, "utf8") });
    } catch {
      /* skip */
    }
  }
  // A synthetic oversized file to prove intra-file splitting across messages.
  files.push({ path: "synthetic/huge-generated.ts", content: "export const BLOB = `" + "X".repeat(14000) + "`;\n" });
  return files;
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      srv.close(() => (port ? resolve(port) : reject(new Error("no port"))));
    });
  });
}

function log(ok, msg) {
  console.log(`${ok ? "  ✓" : "  ✗"} ${msg}`);
}

async function main() {
  const files = gatherFiles();
  const totalContent = files.reduce((s, f) => s + f.content.length, 0);
  const plan = planIndexChunks(files, {
    maxChars: MAX_CHARS,
    maxSessionChars: 5_000_000,
    maxChunks: 1000, // don't let the default 80-chunk cap drop files in this exhaustive harness
    providerLabel: "ChatGPT"
  });

  console.log(
    `\nChunker: ${files.length} files (${Math.round(totalContent / 1000)}k chars) -> ` +
      `${plan.chunks.length} messages at <=${MAX_CHARS} chars each; ${plan.droppedFiles.length} dropped.\n`
  );
  assert.ok(plan.chunks.length > 3, "expected the index to split into several messages");

  const port = await getFreePort();
  const server = new LocalBridgeServer({ port, token: TOKEN, sessionId: SESSION_ID });
  await server.start();

  // Controller side: release the sequential sender when the browser acknowledges the current turn.
  let releaseTurn = null;
  server.onMessage((msg) => {
    if (msg.type === "chat.stream.done" && releaseTurn) {
      releaseTurn();
    }
  });

  // Browser side: a real WebSocket client that receives chat.prompt envelopes and acks each with a
  // chat.stream.done after a short "read" delay (mimicking the page's quiescence-based done).
  const received = [];
  const ackTimes = [];
  const ws = new WebSocket(`ws://127.0.0.1:${port}/?token=${TOKEN}`);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", () => resolve());
    ws.addEventListener("error", () => reject(new Error("browser WS failed to connect")));
  });

  ws.addEventListener("message", (event) => {
    let env;
    try {
      env = JSON.parse(String(event.data));
    } catch {
      return;
    }
    if (env.type !== "chat.prompt") return; // ignore pair.accepted
    const p = env.payload;
    received.push({ at: Date.now(), payload: p });
    // Acknowledge after a brief delay so send/ack ordering is observable.
    setTimeout(() => {
      const label = p.chunkIndex ? `ACK ${p.chunkIndex}/${p.chunkTotal}` : "Working on it.";
      ackTimes.push(Date.now());
      ws.send(
        JSON.stringify(
          createEnvelope({
            id: `ack-${received.length}`,
            sessionId: SESSION_ID,
            type: "chat.stream.done",
            payload: { providerId: p.providerId, fullText: label, finishReason: "complete" }
          })
        )
      );
    }, ACK_DELAY_MS);
  });

  // Wait until the server registers the client.
  for (let i = 0; i < 50 && server.getStatus().browserClients.length === 0; i += 1) {
    await new Promise((r) => setTimeout(r, 20));
  }
  assert.equal(server.getStatus().browserClients.length, 1, "browser client must be paired");

  // Sequential delivery: send chunk, wait for ack, send next — exactly what the controller does.
  const sendTimes = [];
  for (const chunk of plan.chunks) {
    const done = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`chunk ${chunk.index} not acked in time`)), CHUNK_TIMEOUT_MS);
      releaseTurn = () => {
        clearTimeout(timer);
        releaseTurn = null;
        resolve();
      };
    });
    sendTimes.push(Date.now());
    const sent = server.sendToBrowsers(
      createEnvelope({
        id: `chunk-${chunk.index}`,
        sessionId: SESSION_ID,
        type: "chat.prompt",
        payload: {
          providerId: "chatgpt",
          chatUrl: "https://chatgpt.com/",
          prompt: chunk.text,
          promptNumber: chunk.index,
          expectedAction: "submit",
          autoSubmit: true,
          chunkIndex: chunk.index,
          chunkTotal: chunk.total
        }
      })
    );
    assert.equal(sent, 1, `chunk ${chunk.index} should reach exactly one browser`);
    await done;
  }

  // Final task message (the real work), after the codebase was primed.
  const primedNote = buildIndexPrimedNote(plan.chunks.length);
  server.sendToBrowsers(
    createEnvelope({
      id: "final-task",
      sessionId: SESSION_ID,
      type: "chat.prompt",
      payload: {
        providerId: "chatgpt",
        chatUrl: "https://chatgpt.com/",
        prompt: `${primedNote}\n\nUser task:\nAdd a health check to the bridge server.`,
        promptNumber: plan.chunks.length + 1,
        expectedAction: "submit",
        autoSubmit: true
      }
    })
  );
  await new Promise((r) => setTimeout(r, 250));

  // ---- Assertions -----------------------------------------------------------------------------
  const priming = received.slice(0, plan.chunks.length);
  const finalMsg = received[plan.chunks.length];

  assert.equal(received.length, plan.chunks.length + 1, "browser must receive every chunk plus the final task");
  log(true, `Browser received all ${plan.chunks.length} index messages + 1 task message.`);

  priming.forEach((r, i) => {
    const chunk = plan.chunks[i];
    assert.equal(r.payload.chunkIndex, i + 1, "chunk arrives in order");
    assert.equal(r.payload.chunkTotal, plan.chunks.length, "chunk total is consistent");
    assert.equal(r.payload.prompt, chunk.text, "delivered text matches the planned chunk");
    assert.ok(r.payload.prompt.length <= MAX_CHARS, `chunk ${i + 1} within ${MAX_CHARS} chars`);
    assert.ok(r.payload.prompt.includes(`ACK ${i + 1}/${plan.chunks.length}`), "chunk requests a positional ACK");
    assert.ok(r.payload.prompt.includes("webchat_codebase_index"), "chunk carries index framing");
  });
  log(true, `Every index message is ordered, framed, requests ACK i/N, and is <= ${MAX_CHARS} chars.`);

  // Strict ack-gating: chunk i+1 is sent only after chunk i's ack was received.
  let gated = true;
  for (let i = 1; i < sendTimes.length; i += 1) {
    if (!(sendTimes[i] >= ackTimes[i - 1])) gated = false;
  }
  assert.ok(gated, "each chunk must be sent only after the previous one was acknowledged");
  log(true, "Ack-gating holds: no chunk was sent before the previous chunk was acknowledged.");

  // Large-file splitting across messages.
  const hugeRefs = plan.chunks.flatMap((c) => c.files).filter((f) => f.path === "synthetic/huge-generated.ts");
  assert.ok(hugeRefs.length >= 2, "the oversized file must be split across messages");
  assert.ok(hugeRefs.every((f) => f.parts === hugeRefs.length), "part totals agree");
  log(true, `Oversized file split into ${hugeRefs.length} parts (part="k/n") across messages.`);

  // Final task message.
  assert.ok(!finalMsg.payload.chunkIndex, "final task is not a chunk");
  assert.ok(finalMsg.payload.prompt.includes(primedNote), "final task carries the codebase-primed note");
  assert.ok(finalMsg.payload.prompt.includes("User task:"), "final task carries the real instruction");
  log(true, "Final task message follows priming and carries the 'codebase primed' note + task.");

  ws.close();
  server.dispose();
  console.log("\n✅ Chunked-index end-to-end verification PASSED (real bridge + real chunker).\n");
}

main().catch((err) => {
  console.error("\n❌ Verification FAILED:", err?.message || err);
  process.exit(1);
});
