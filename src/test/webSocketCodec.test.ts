import test from "node:test";
import assert from "node:assert/strict";
import {
  createWebSocketAccept,
  decodeFrames,
  encodePingFrame,
  encodeTextFrame
} from "../bridge/webSocketCodec";

test("createWebSocketAccept matches the RFC example", () => {
  assert.equal(
    createWebSocketAccept("dGhlIHNhbXBsZSBub25jZQ=="),
    "s3pPLMBiTxaQ9kYGzzhZRbK+xOo="
  );
});

test("decodeFrames reads a masked text frame", () => {
  const encoded = encodeTextFrame("hello bridge", { mask: true });
  const decoded = decodeFrames(encoded);

  assert.deepEqual(decoded.messages, ["hello bridge"]);
  assert.equal(decoded.remaining.length, 0);
  assert.equal(decoded.closeRequested, false);
});

test("decodeFrames leaves partial frames buffered", () => {
  const encoded = encodeTextFrame("partial", { mask: true });
  const first = decodeFrames(encoded.subarray(0, 3));
  const second = decodeFrames(Buffer.concat([first.remaining, encoded.subarray(3)]));

  assert.deepEqual(first.messages, []);
  assert.deepEqual(second.messages, ["partial"]);
});

test("decodeFrames exposes ping payloads for pong replies", () => {
  const encoded = encodePingFrame(Buffer.from("keepalive"));
  const decoded = decodeFrames(encoded);

  assert.equal(decoded.pongPayloads.length, 1);
  assert.equal(decoded.pongPayloads[0].toString("utf8"), "keepalive");
});
