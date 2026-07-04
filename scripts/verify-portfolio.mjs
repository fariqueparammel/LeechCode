// Headless end-to-end verification of the WebChat agent pipeline.
//
// This exercises the REAL shipped extension code:
//   - src/bridge/localBridgeServer.ts  (LocalBridgeServer: HTTP+WS, framing, pairing, queue)
//   - src/bridge/protocol.ts           (createEnvelope / envelope contract)
//   - src/prompt/buildPrompt.ts        (provider-neutral XML prompt)
//   - src/agent/toolProtocol.ts        (buildAgentToolInstructions + parseAgentResponse)
//   - src/session/policy.ts            (token budget + next-action decision)
//
// The only simulated pieces are the two inherently-external ends:
//   - the browser page + LLM  -> a Node WebSocket client that fills the role content.js plays and
//                                returns a deterministic <webchat_agent_response> portfolio block,
//                                exactly like a real ChatGPT/Claude tab would.
//   - vscode.workspace.fs      -> a Node fs write guarded by the SAME path-safety rules as
//                                src/workspace/applyAgentChanges.ts (which can only run in the
//                                extension host).
//
// Result: a real portfolio written to demo/portfolio/ via the genuine prompt->bridge->parse loop.

import { fileURLToPath } from "node:url";
import path from "node:path";
import { mkdir, writeFile, rm } from "node:fs/promises";

import { LocalBridgeServer } from "../dist/bridge/localBridgeServer.js";
import { createEnvelope } from "../dist/bridge/protocol.js";
import { buildPrompt } from "../dist/prompt/buildPrompt.js";
import { buildAgentToolInstructions, parseAgentResponse } from "../dist/agent/toolProtocol.js";
import {
  applyPromptUsage,
  applyResponseUsage,
  decideNextSessionAction,
  defaultSessionPolicy
} from "../dist/session/policy.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 53461; // off the default 53451 so it never clashes with a running extension
const TOKEN = "webchat-verify-token";
const SESSION_ID = "verify-portfolio";

const log = (...a) => console.log("[verify]", ...a);

// ---- the portfolio the "model" will return (base64 = the preferred contentBase64 path) ----------
const b64 = (s) => Buffer.from(s, "utf8").toString("base64");

const indexHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Jaseel S K — Developer Portfolio</title>
    <link rel="stylesheet" href="./style.css" />
  </head>
  <body>
    <header class="nav">
      <a class="brand" href="#top">JSK<span>.</span></a>
      <nav>
        <a href="#about">About</a>
        <a href="#projects">Projects</a>
        <a href="#contact">Contact</a>
      </nav>
    </header>

    <main id="top">
      <section class="hero">
        <p class="eyebrow">Software Engineer</p>
        <h1>Hi, I'm Jaseel.<br />I build tools that make AI workflows feel effortless.</h1>
        <p class="lede">
          I work across editor extensions, browser automation, and developer tooling —
          turning rough ideas into shipped, dependable software.
        </p>
        <div class="cta">
          <a class="btn primary" href="#projects">View work</a>
          <a class="btn ghost" href="#contact">Get in touch</a>
        </div>
      </section>

      <section id="about" class="about">
        <h2>About</h2>
        <p>
          I enjoy the seam between the editor and the browser — bridges, protocols, and the small
          UX details that make an agentic loop feel reliable. Recently I've been building WebChat,
          an IDE extension that drives a real browser AI chat as a free model transport.
        </p>
        <ul class="skills">
          <li>TypeScript</li><li>Node.js</li><li>VS Code Extensions</li>
          <li>Browser Extensions</li><li>WebSockets</li><li>UI/UX</li>
        </ul>
      </section>

      <section id="projects" class="projects">
        <h2>Projects</h2>
        <div class="grid">
          <article class="card">
            <h3>WebChat</h3>
            <p>Agentic coding loop powered by a logged-in browser chat session — no API keys.</p>
            <span class="tag">IDE + Browser</span>
          </article>
          <article class="card">
            <h3>Local Bridge</h3>
            <p>A hand-rolled localhost HTTP + WebSocket bridge with framing, pairing, and queueing.</p>
            <span class="tag">Protocol</span>
          </article>
          <article class="card">
            <h3>Provider Adapters</h3>
            <p>Per-site content scripts for ChatGPT, Claude, Gemini, and Qwen.</p>
            <span class="tag">Automation</span>
          </article>
        </div>
      </section>

      <section id="contact" class="contact">
        <h2>Contact</h2>
        <p>Let's build something. Reach out and I'll get back to you.</p>
        <a class="btn primary" href="mailto:jaseelsk@gmail.com">jaseelsk@gmail.com</a>
      </section>
    </main>

    <footer>
      <p>© <span id="year"></span> Jaseel S K · Built through WebChat</p>
    </footer>

    <script src="./script.js"></script>
  </body>
</html>
`;

const styleCss = `:root {
  --bg: #0b0f14;
  --panel: #121821;
  --text: #e6edf3;
  --muted: #8b98a5;
  --accent: #4cc2ff;
  --accent-2: #7c5cff;
  --border: #1f2933;
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}

* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body {
  margin: 0;
  color: var(--text);
  background:
    radial-gradient(1200px 600px at 80% -10%, rgba(124, 92, 255, 0.18), transparent),
    radial-gradient(900px 500px at -10% 10%, rgba(76, 194, 255, 0.14), transparent),
    var(--bg);
  line-height: 1.6;
}

.nav {
  position: sticky;
  top: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 28px;
  backdrop-filter: blur(10px);
  background: rgba(11, 15, 20, 0.6);
  border-bottom: 1px solid var(--border);
  z-index: 10;
}
.brand { font-weight: 800; letter-spacing: 1px; text-decoration: none; color: var(--text); }
.brand span { color: var(--accent); }
.nav nav a { color: var(--muted); text-decoration: none; margin-left: 22px; font-weight: 600; }
.nav nav a:hover { color: var(--text); }

main { max-width: 920px; margin: 0 auto; padding: 0 24px; }
section { padding: 84px 0; border-bottom: 1px solid var(--border); }

.eyebrow {
  text-transform: uppercase;
  letter-spacing: 2px;
  font-size: 13px;
  font-weight: 700;
  color: var(--accent);
  margin: 0 0 14px;
}
.hero h1 { font-size: clamp(32px, 6vw, 54px); line-height: 1.1; margin: 0 0 18px; }
.lede { color: var(--muted); font-size: 19px; max-width: 620px; }
.cta { display: flex; gap: 14px; margin-top: 28px; flex-wrap: wrap; }

.btn {
  display: inline-block;
  padding: 12px 22px;
  border-radius: 10px;
  text-decoration: none;
  font-weight: 700;
  transition: transform 0.12s ease, box-shadow 0.12s ease;
}
.btn:hover { transform: translateY(-2px); }
.btn.primary {
  color: #06121b;
  background: linear-gradient(135deg, var(--accent), var(--accent-2));
  box-shadow: 0 12px 30px rgba(76, 194, 255, 0.25);
}
.btn.ghost { color: var(--text); border: 1px solid var(--border); }

h2 { font-size: 28px; margin: 0 0 18px; }

.skills { display: flex; flex-wrap: wrap; gap: 10px; padding: 0; margin: 22px 0 0; list-style: none; }
.skills li {
  border: 1px solid var(--border);
  background: var(--panel);
  color: var(--muted);
  padding: 7px 14px;
  border-radius: 999px;
  font-size: 14px;
}

.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 18px; }
.card {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 22px;
}
.card h3 { margin: 0 0 8px; }
.card p { color: var(--muted); margin: 0 0 16px; }
.tag {
  font-size: 12px;
  font-weight: 700;
  color: var(--accent);
  border: 1px solid var(--border);
  padding: 4px 10px;
  border-radius: 999px;
}

.contact .btn { margin-top: 12px; }

footer { text-align: center; color: var(--muted); padding: 28px; font-size: 14px; }
`;

const scriptJs = `// Tiny touches: year stamp + active-section nav highlight + reveal on scroll.
document.getElementById("year").textContent = new Date().getFullYear();

const links = [...document.querySelectorAll(".nav nav a")];
const sections = links
  .map((link) => document.querySelector(link.getAttribute("href")))
  .filter(Boolean);

const observer = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const id = "#" + entry.target.id;
      links.forEach((link) =>
        link.style.color = link.getAttribute("href") === id ? "var(--text)" : ""
      );
    }
  },
  { rootMargin: "-45% 0px -45% 0px" }
);

sections.forEach((section) => observer.observe(section));
`;

function buildPortfolioAgentResponse() {
  return {
    summary:
      "Built a single-page developer portfolio for Jaseel S K under demo/portfolio (index.html, " +
      "style.css, script.js): dark themed hero, about/skills, projects grid, contact. No external deps.",
    files: [
      { path: "demo/portfolio/index.html", action: "write", contentBase64: b64(indexHtml) },
      { path: "demo/portfolio/style.css", action: "write", contentBase64: b64(styleCss) },
      { path: "demo/portfolio/script.js", action: "write", contentBase64: b64(scriptJs) }
    ],
    nextSteps: ["Open demo/portfolio/index.html in a browser to preview the portfolio."]
  };
}

// ---- path safety mirrored from src/workspace/applyAgentChanges.ts (vscode-free) ----------------
function resolveSafePath(relativePath) {
  const normalized = path.normalize(relativePath).replaceAll("\\", "/");
  if (
    path.isAbsolute(relativePath) ||
    normalized === "." ||
    normalized.startsWith("../") ||
    normalized === ".." ||
    normalized.includes("/../")
  ) {
    throw new Error(`Refusing unsafe workspace path: ${relativePath}`);
  }
  return path.join(repoRoot, ...normalized.split("/").filter(Boolean));
}

async function applyChanges(changes) {
  const applied = [];
  for (const change of changes) {
    const target = resolveSafePath(change.path);
    if (change.action === "delete") {
      await rm(target, { force: true });
    } else {
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, change.content ?? "", "utf8");
    }
    applied.push(`${change.action}: ${change.path}`);
  }
  return applied;
}

// ---- the run ------------------------------------------------------------------------------------
async function main() {
  const server = new LocalBridgeServer({ port: PORT, token: TOKEN, sessionId: SESSION_ID });

  const done = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Timed out waiting for assistant done.")), 15000);
    server.onMessage((msg) => {
      if (msg.type === "pair.request") log("browser paired:", msg.payload?.userAgent ?? "client");
      if (msg.type === "chat.state") log("browser state:", msg.payload?.state, "-", msg.payload?.detail);
      if (msg.type === "chat.stream.done") {
        clearTimeout(timeout);
        resolve(msg.payload.fullText);
      }
    });
  });

  await server.start();
  log(`real LocalBridgeServer listening on ws://127.0.0.1:${PORT}`);

  // ---- BROWSER ROLE: a WS client standing in for content.js + the chat page/LLM ----
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/?token=${encodeURIComponent(TOKEN)}`);
  await new Promise((res, rej) => {
    ws.addEventListener("open", res, { once: true });
    ws.addEventListener("error", rej, { once: true });
  });
  const send = (type, payload) =>
    ws.send(JSON.stringify(createEnvelope({ id: cryptoId(), sessionId: SESSION_ID, type, payload })));

  send("pair.request", { clientKind: "browser-extension", userAgent: "verify-harness/Node", extensionVersion: "0.0.1" });

  ws.addEventListener("message", (event) => {
    const envelope = JSON.parse(event.data);
    if (envelope.type !== "chat.prompt") return;
    log(`browser received chat.prompt #${envelope.payload.promptNumber} (action=${envelope.payload.expectedAction})`);
    send("chat.state", { providerId: envelope.payload.providerId, state: "submitting", detail: "Prompt submitted in chat." });

    // The "LLM" produces the marked agent-response block, streamed back like a real page would.
    const reply =
      "Here is the portfolio built through WebChat's file tooling.\n\n" +
      "<webchat_agent_response>\n" +
      JSON.stringify(buildPortfolioAgentResponse()) +
      "\n</webchat_agent_response>";

    let i = 0;
    const chunk = 120;
    const timer = setInterval(() => {
      const slice = reply.slice(i, i + chunk);
      i += chunk;
      const fullText = reply.slice(0, Math.min(i, reply.length));
      send("chat.stream.delta", { providerId: envelope.payload.providerId, text: slice, fullText });
      if (i >= reply.length) {
        clearInterval(timer);
        send("chat.stream.done", { providerId: envelope.payload.providerId, fullText: reply, finishReason: "complete" });
      }
    }, 10);
  });

  // ---- EXTENSION HOST ROLE: build the real prompt and dispatch it over the real bridge ----
  const provider = { id: "mock", label: "Verify Harness Chat", host: "127.0.0.1", chatUrl: `http://127.0.0.1:${PORT}/` };
  const policy = defaultSessionPolicy;
  let usage = { promptCount: 0, inputTokensUsed: 0, outputTokensUsed: 0 };
  const action = decideNextSessionAction(usage, policy); // "continue" on the first prompt

  const instructions = buildAgentToolInstructions({
    maxContextTokens: policy.budget.maxContextTokens,
    compactEveryPrompts: policy.compactEveryPrompts,
    action
  });
  const prompt = buildPrompt({
    provider,
    instruction: [
      "User task:\nBuild a simple, clean single-page developer portfolio for Jaseel S K under demo/portfolio.",
      instructions
    ].join("\n\n"),
    files: [] // no editor context needed for a greenfield build
  });
  usage = applyPromptUsage(usage, prompt);
  log(`extension built prompt (~${usage.inputTokensUsed} est. input tokens), dispatching over bridge...`);

  const sent = server.sendToBrowsers(
    createEnvelope({
      id: cryptoId(),
      sessionId: SESSION_ID,
      type: "chat.prompt",
      payload: {
        providerId: provider.id,
        chatUrl: provider.chatUrl,
        prompt,
        promptNumber: usage.promptCount,
        expectedAction: action === "compact" || action === "rotate" ? action : "submit",
        autoSubmit: true
      }
    })
  );
  log(`dispatched chat.prompt to ${sent} browser client(s)`);

  // ---- back in the extension host: parse the assistant output and apply files ----
  const fullText = await done;
  usage = applyResponseUsage(usage, fullText);
  const parsed = parseAgentResponse(fullText);
  if (!parsed) throw new Error("parseAgentResponse returned nothing — no marked block found.");
  log(`parsed agent response: ${parsed.files.length} file change(s); summary: "${parsed.summary.slice(0, 70)}..."`);

  const applied = await applyChanges(parsed.files);
  log("applied file changes:\n  " + applied.join("\n  "));
  log(`session usage after turn: prompts=${usage.promptCount} input~${usage.inputTokensUsed} output~${usage.outputTokensUsed}`);

  ws.close();
  server.dispose();
  log("DONE");
}

function cryptoId() {
  return globalThis.crypto.randomUUID();
}

main().catch((err) => {
  console.error("[verify] FAILED:", err);
  process.exit(1);
});
