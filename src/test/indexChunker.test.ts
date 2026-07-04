import test from "node:test";
import assert from "node:assert/strict";
import { buildIndexPrimedNote, planIndexChunks, splitContent } from "../prompt/indexChunker";
import type { PromptFile } from "../prompt/types";

function file(path: string, content: string): PromptFile {
  return { path, content };
}

test("splitContent produces ordered slices that rejoin to the original and never exceed the budget", () => {
  const content = "abcdefghij".repeat(100); // 1000 chars
  const slices = splitContent(content, 250);
  assert.equal(slices.join(""), content, "slices must reassemble to the original file exactly");
  for (const slice of slices) {
    assert.ok(slice.length <= 250, `slice length ${slice.length} exceeded budget`);
  }
  assert.equal(slices.length, 4);
});

test("splitContent returns a single slice when the content already fits", () => {
  assert.deepEqual(splitContent("short", 100), ["short"]);
});

test("small workspace packs into a single chunk", () => {
  const files = [file("a.ts", "const a = 1;"), file("b.ts", "const b = 2;")];
  const plan = planIndexChunks(files, { maxChars: 12000 });
  assert.equal(plan.chunks.length, 1);
  assert.equal(plan.includedFiles, 2);
  assert.deepEqual(plan.droppedFiles, []);
});

test("many files split into several ordered chunks, each under the per-message limit", () => {
  const files: PromptFile[] = [];
  for (let i = 0; i < 40; i += 1) {
    files.push(file(`src/mod-${i}.ts`, `// module ${i}\n` + "x".repeat(400)));
  }
  const maxChars = 2000;
  const plan = planIndexChunks(files, { maxChars, providerLabel: "ChatGPT" });

  assert.ok(plan.chunks.length > 1, "expected multiple chunks");
  plan.chunks.forEach((chunk, i) => {
    assert.equal(chunk.index, i + 1, "chunk index is 1-based and sequential");
    assert.equal(chunk.total, plan.chunks.length, "every chunk reports the same total");
    assert.ok(chunk.chars <= maxChars, `chunk ${chunk.index} was ${chunk.chars} chars (> ${maxChars})`);
    assert.match(chunk.text, /webchat_codebase_index part=/, "chunk carries index framing");
    assert.match(chunk.text, new RegExp(`ACK ${chunk.index}/${plan.chunks.length}`), "asks for a positional ACK");
    // Every file placed in this chunk is named in the message.
    for (const ref of chunk.files) {
      assert.ok(chunk.text.includes(ref.path), `chunk must name ${ref.path}`);
    }
  });

  // No file is lost across the chunk sequence.
  const namedPaths = new Set(plan.chunks.flatMap((c) => c.files.map((f) => f.path)));
  assert.equal(namedPaths.size, 40);
});

test("a file larger than one message is split with part=k/n markers and continuation notes", () => {
  const big = "L".repeat(9000);
  const plan = planIndexChunks([file("src/huge.ts", big)], { maxChars: 3000 });

  const refs = plan.chunks.flatMap((c) => c.files).filter((f) => f.path === "src/huge.ts");
  assert.ok(refs.length > 1, "the large file must be delivered in multiple parts");
  // Parts are numbered 1..n over n.
  const parts = refs.map((r) => r.part).sort((a, b) => a - b);
  assert.deepEqual(parts, refs.map((_, i) => i + 1));
  assert.ok(refs.every((r) => r.parts === refs.length));
  // The delivered content adds up to the whole file.
  assert.equal(refs.reduce((sum, r) => sum + r.bytes, 0), big.length);

  const combined = plan.chunks.map((c) => c.text).join("\n");
  assert.match(combined, /part="1" of=/, "first part is tagged");
  assert.match(combined, /large file: continued in the next message/, "non-final parts announce continuation");
  assert.match(combined, /continued from the previous message/, "later parts announce resumption");
});

test("session cap drops trailing files and reports them", () => {
  const files = [
    file("keep-1.ts", "a".repeat(1000)),
    file("keep-2.ts", "b".repeat(1000)),
    file("drop-1.ts", "c".repeat(1000)),
    file("drop-2.ts", "d".repeat(1000))
  ];
  const plan = planIndexChunks(files, { maxChars: 12000, maxSessionChars: 2200 });
  const included = new Set(plan.chunks.flatMap((c) => c.files.map((f) => f.path)));
  assert.ok(included.has("keep-1.ts") && included.has("keep-2.ts"));
  assert.ok(plan.droppedFiles.includes("drop-1.ts") && plan.droppedFiles.includes("drop-2.ts"));
});

test("maxChunks cap limits the sequence and records the overflow as dropped", () => {
  const files: PromptFile[] = [];
  for (let i = 0; i < 20; i += 1) {
    files.push(file(`f-${i}.ts`, "y".repeat(1500)));
  }
  const plan = planIndexChunks(files, { maxChars: 2000, maxChunks: 3 });
  assert.equal(plan.chunks.length, 3);
  assert.ok(plan.droppedFiles.length > 0, "files beyond the chunk cap are dropped");
});

test("buildIndexPrimedNote references the delivered message count", () => {
  assert.match(buildIndexPrimedNote(5), /previous 5 messages/);
  assert.match(buildIndexPrimedNote(1), /previous 1 message\b/);
  assert.match(buildIndexPrimedNote(3), /FINAL message with the actual task/);
});
