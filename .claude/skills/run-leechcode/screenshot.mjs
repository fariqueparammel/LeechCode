#!/usr/bin/env node
// Cross-platform headless screenshot of a LeechCode page (defaults to the mock chat on :53452).
// Finds a Chromium-family browser on macOS / Linux / Windows — known install locations, then a PATH
// lookup, honouring $CHROME_PATH / $BROWSER — launches it headless, and writes a PNG. If the target
// is the mock page and it isn't already up, it spins the mock server up for the shot and stops it.
//
//   node .claude/skills/run-leechcode/screenshot.mjs [url] [outPath]
//   CHROME_PATH=/path/to/chrome node .claude/skills/run-leechcode/screenshot.mjs
//
// Run from an UNSANDBOXED shell (headless Chrome/Brave silently hang otherwise). Always uses an
// isolated --user-data-dir so the user's real profile is never touched.

import { spawn, spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import http from "node:http";

const MOCK_URL = "http://127.0.0.1:53452/";
const url = process.argv[2] || MOCK_URL;
const out = process.argv[3] || path.join(tmpdir(), "leechcode-screenshot.png");
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..", "..");

/** Candidate Chromium-family executables for the current OS, most-preferred first. */
function browserCandidates() {
  const env = [process.env.CHROME_PATH, process.env.BRAVE_PATH, process.env.BROWSER].filter(Boolean);
  if (process.platform === "darwin") {
    return [
      ...env,
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
      `${process.env.HOME}/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`
    ];
  }
  if (process.platform === "win32") {
    const roots = [process.env["PROGRAMFILES"], process.env["PROGRAMFILES(X86)"], process.env.LOCALAPPDATA].filter(Boolean);
    const rel = [
      "Google\\Chrome\\Application\\chrome.exe",
      "Microsoft\\Edge\\Application\\msedge.exe",
      "BraveSoftware\\Brave-Browser\\Application\\brave.exe",
      "Chromium\\Application\\chrome.exe"
    ];
    return [...env, ...roots.flatMap((root) => rel.map((r) => path.join(root, r)))];
  }
  // linux + others
  return [
    ...env,
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/brave-browser",
    "/usr/bin/microsoft-edge",
    "/snap/bin/chromium",
    "/opt/google/chrome/chrome"
  ];
}

/** Resolve a name on PATH (works cross-platform via `where`/`command -v`). */
function onPath(name) {
  const finder = process.platform === "win32" ? ["where", [name]] : ["command", ["-v", name]];
  const res = spawnSync(finder[0], finder[1], { encoding: "utf8", shell: process.platform === "win32" });
  const line = (res.stdout || "").split(/\r?\n/).find((l) => l.trim());
  return line && existsSync(line.trim()) ? line.trim() : undefined;
}

function findBrowser() {
  for (const candidate of browserCandidates()) {
    if (candidate && existsSync(candidate)) {
      return candidate;
    }
  }
  const names =
    process.platform === "win32"
      ? ["chrome", "msedge", "brave"]
      : ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "brave-browser", "microsoft-edge"];
  for (const name of names) {
    const found = onPath(name);
    if (found) {
      return found;
    }
  }
  return undefined;
}

function reachable(target) {
  return new Promise((resolve) => {
    const req = http.get(target, (res) => {
      res.resume();
      resolve(true);
    });
    req.setTimeout(1500, () => {
      req.destroy();
      resolve(false);
    });
    req.on("error", () => resolve(false));
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const browser = findBrowser();
  if (!browser) {
    console.error(
      "No Chromium-family browser found. Install Chrome/Brave/Edge/Chromium, or set CHROME_PATH=/full/path/to/executable."
    );
    process.exit(2);
  }
  console.log(`browser: ${browser}`);

  // Bring the mock page up if we're shooting it and it isn't running.
  let mock;
  if (url === MOCK_URL && !(await reachable(url))) {
    mock = spawn(process.execPath, [path.join(ROOT, "scripts", "run-mock-webchat.mjs")], { stdio: "ignore" });
    for (let i = 0; i < 20 && !(await reachable(url)); i += 1) {
      await sleep(250);
    }
    console.log("mock chat server started on :53452");
  }

  const args = [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-extensions",
    "--hide-scrollbars",
    `--user-data-dir=${path.join(tmpdir(), "leechcode-headless-profile")}`,
    "--window-size=1280,900",
    `--screenshot=${out}`,
    url
  ];
  if (process.platform === "linux") {
    args.unshift("--no-sandbox"); // required in most Linux containers
  }

  console.log(`shooting ${url} -> ${out}`);
  // Launch async and treat "the PNG appeared" as success — headless Chrome/Brave often lingers after
  // writing the screenshot, so waiting for the process to exit would hang. We poll, then kill it.
  let bytesBefore = 0;
  try {
    bytesBefore = statSync(out).size;
  } catch {
    /* not there yet */
  }
  const child = spawn(browser, args, { stdio: "ignore" });
  const deadline = Date.now() + 45000;
  let ok = false;
  while (Date.now() < deadline) {
    await sleep(300);
    try {
      const size = statSync(out).size;
      if (size > 0 && size !== bytesBefore) {
        ok = true;
        break;
      }
    } catch {
      /* keep waiting */
    }
  }
  try {
    child.kill();
  } catch {
    /* already gone */
  }
  if (mock) {
    mock.kill();
  }
  if (!ok) {
    console.error("screenshot failed — the browser never produced the PNG (are you in a sandboxed shell?).");
    process.exit(1);
  }
  console.log(`\n✅ wrote ${out} (${statSync(out).size} bytes)`);
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
