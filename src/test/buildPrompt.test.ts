import test from "node:test";
import assert from "node:assert/strict";
import { buildPrompt } from "../prompt/buildPrompt";
import { getProvider } from "../providers/registry";

test("buildPrompt escapes metadata and wraps instruction and file content", () => {
  const prompt = buildPrompt({
    provider: getProvider("chatgpt"),
    instruction: "Fix <this> & explain",
    files: [
      {
        path: "src/example.ts",
        languageId: "typescript",
        content: "const value = 1;"
      }
    ]
  });

  assert.match(prompt, /<webchat_request>/);
  assert.match(prompt, /Target web chat: ChatGPT/);
  assert.match(prompt, /<!\[CDATA\[\n\s*Fix <this> & explain\n\s*\]\]>/);
  assert.match(prompt, /<file path="src\/example.ts" language="typescript">/);
  assert.match(prompt, /<!\[CDATA\[\nconst value = 1;\n\]\]>/);
});
