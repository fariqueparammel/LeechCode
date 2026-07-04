// Headless test of the @codebase / /index indexing path + bridge dispatch.
//
// The controller's collectCodebaseContext() uses vscode.workspace APIs (extension-host only), so we
// MIRROR its exact logic here over the real repo using Node fs, then build the prompt with the REAL
// buildPrompt + buildAgentToolInstructions, push it through the REAL LocalBridgeServer to a fake
// browser client, and measure size + time. The goal: prove it terminates and reveal how big the
// payload the browser must paste actually is (the likely cause of "stuck after /index").

import { fileURLToPath } from "node:url";
import path from "node:path";
import { readdir, readFile, stat } from "node:fs/promises";

import { LocalBridgeServer } from "../dist/bridge/localBridgeServer.js";
import { createEnvelope } from "../dist/bridge/protocol.js";
import { buildPrompt } from "../dist/prompt/buildPrompt.js";
import { buildAgentToolInstructions } from "../dist/agent/toolProtocol.js";
import { defaultSessionPolicy, estimateTokens } from "../dist/session/policy.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const log = (...a) => console.log("[index-test]", ...a);

const EXCLUDE_DIRS = new Set(["node_modules", ".git", "dist", "out", ".next", ".vscode-test"]);
const EXCLUDE_EXT = new Set([".vsix", ".lock", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".pdf", ".zip", ".map"]);
const EXCLUDE_NAMES = new Set(["pnpm-lock.yaml", "package-lock.json"]);

async function walk(dir, out) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (EXCLUDE_DIRS.has(entry.name)) continue;
      await walk(full, out);
    } else if (entry.isFile()) {
      if (EXCLUDE_EXT.has(path.extname(entry.name)) || EXCLUDE_NAMES.has(entry.name)) continue;
      out.push(path.relative(repoRoot, full).split(path.sep).join("/"));
    }
    if (out.length >= 1500) return;
  }
}

// Mirror of controller.collectCodebaseContext(budget)
async function collectCodebaseContext(budget) {
  const started = Date.now();
  const rels = [];
  await walk(repoRoot, rels);
  rels.sort((a, b) => a.localeCompare(b));

  const files = [{ path: "WORKSPACE_FILE_TREE.txt", content: rels.join("\n") }];
  let used = rels.join("\n").length;
  let truncated = false;
  let skippedLarge = 0;
  let skippedBinary = 0;

  for (const rel of rels) {
    if (used >= budget) { truncated = true; break; }
    try {
      const info = await stat(path.join(repoRoot, rel));
      if (info.size > 200_000) { skippedLarge++; continue; }
      const content = await readFile(path.join(repoRoot, rel), "utf8");
      if (/[\x00-\x08]/.test(content)) { skippedBinary++; continue; }
      if (used + content.length > budget) { truncated = true; continue; }
      files.push({ path: rel, content });
      used += content.length;
    } catch {
      /* skip */
    }
  }
  return { files, totalFilesFound: rels.length, budget, used, truncated, skippedLarge, skippedBinary, ms: Date.now() - started };
}

function check(name, pass, detail = "") {
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
  return pass;
}

async function main() {
  let ok = true;

  // 1) Indexing terminates and is bounded (default 48k budget).
  const idx = await collectCodebaseContext(48000);
  log(`walked ${idx.totalFilesFound} files in ${idx.ms}ms; indexed ${idx.files.length - 1} (budget ${idx.budget} chars, used ${idx.used}); skipped ${idx.skippedLarge} large / ${idx.skippedBinary} binary; truncated=${idx.truncated}`);
  ok = check("indexing terminates", true) && ok;
  ok = check("indexing is reasonably fast (<5s)", idx.ms < 5000, `${idx.ms}ms`) && ok;
  ok = check("no node_modules leaked", !idx.files.some((f) => f.path.includes("node_modules"))) && ok;
  ok = check("file tree present", idx.files[0]?.path === "WORKSPACE_FILE_TREE.txt") && ok;

  // 2) Build the REAL prompt the IDE would send with @codebase attached.
  const instructions = buildAgentToolInstructions({
    maxContextTokens: defaultSessionPolicy.budget.maxContextTokens,
    compactEveryPrompts: 5,
    action: "continue",
    mode: "ask"
  });
  const prompt = buildPrompt({
    provider: { id: "chatgpt", label: "ChatGPT", host: "chatgpt.com", chatUrl: "https://chatgpt.com/" },
    instruction: ["User task:\nExplain what this project does.", instructions].join("\n\n"),
    files: idx.files
  });
  const chars = prompt.length;
  const tokens = estimateTokens(prompt);
  log(`built prompt: ${chars.toLocaleString()} chars ≈ ${tokens.toLocaleString()} tokens`);

  // This is the crux: a prompt this big is what the browser must paste into the chat input.
  const PASTE_FREEZE_THRESHOLD = 120_000; // chars — above this, ProseMirror/contenteditable paste stalls
  ok = check(
    `prompt small enough to paste without freezing the chat (< ${PASTE_FREEZE_THRESHOLD} chars)`,
    chars < PASTE_FREEZE_THRESHOLD,
    `${chars.toLocaleString()} chars`
  ) && ok;

  // 3) Push the real prompt through the real bridge to a fake browser client; confirm delivery + time.
  const PORT = 53471;
  const TOKEN = "index-test-token";
  const server = new LocalBridgeServer({ port: PORT, token: TOKEN, sessionId: "index-test" });
  const delivered = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("client never received the prompt")), 10000);
    globalThis.__resolveDelivered = (payloadLen, dt) => { clearTimeout(timer); resolve({ payloadLen, dt }); };
  });
  await server.start();

  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/?token=${TOKEN}`);
  let sentAt = 0;
  ws.addEventListener("message", (event) => {
    const env = JSON.parse(event.data);
    if (env.type === "chat.prompt") {
      globalThis.__resolveDelivered(env.payload.prompt.length, Date.now() - sentAt);
    }
  });
  await new Promise((res, rej) => {
    ws.addEventListener("open", res, { once: true });
    ws.addEventListener("error", rej, { once: true });
  });

  sentAt = Date.now();
  const sent = server.sendToBrowsers(
    createEnvelope({
      id: globalThis.crypto.randomUUID(),
      sessionId: "index-test",
      type: "chat.prompt",
      payload: { providerId: "chatgpt", chatUrl: "https://chatgpt.com/", prompt, promptNumber: 0, expectedAction: "submit", autoSubmit: true }
    })
  );
  ok = check("bridge dispatched to the fake browser", sent === 1) && ok;

  const result = await delivered;
  log(`bridge delivered ${result.payloadLen.toLocaleString()} chars to the client in ${result.dt}ms`);
  ok = check("prompt arrived intact over the bridge", result.payloadLen === chars) && ok;
  ok = check("bridge transfer is fast (<2s)", result.dt < 2000, `${result.dt}ms`) && ok;

  ws.close();
  server.dispose();

  // 4) Per-provider message limits: building with each provider's limit must produce a fitting prompt.
  console.log("");
  log("per-provider capping (context fits each provider's per-message limit):");
  const trim = (files, budget) => {
    const out = [];
    let used = 0;
    for (const f of files) {
      const size = f.path.length + f.content.length + 40;
      if (out.length > 0 && used + size > budget) continue;
      out.push(f);
      used += size;
    }
    return out;
  };
  for (const [label, limit] of [["qwen", 8000], ["chatgpt", 12000], ["claude", 30000]]) {
    const contextBudget = Math.max(2000, Math.min(48000, limit - 4000));
    const cb = await collectCodebaseContext(contextBudget);
    const fitted = trim(cb, contextBudget);
    const p = buildPrompt({
      provider: { id: label, label, host: "x", chatUrl: "https://x/" },
      instruction: ["User task:\nExplain the project.", instructions].join("\n\n"),
      files: fitted
    });
    ok = check(`${label} prompt fits its ${limit.toLocaleString()}-char limit`, p.length <= limit, `${p.length.toLocaleString()} chars, ${fitted.length - 1} files`) && ok;
  }

  console.log("");
  log(ok ? "ALL CHECKS PASSED" : "SOME CHECKS FAILED — see above");
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error("[index-test] ERROR:", err);
  process.exit(1);
});
