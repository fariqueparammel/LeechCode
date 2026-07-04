import { createServer } from "node:net";
import test from "node:test";
import assert from "node:assert/strict";
import { LocalBridgeServer } from "../bridge/localBridgeServer";
import type { BridgeEnvelope, PairAcceptedPayload } from "../bridge/protocol";

type TestWebSocket = {
  addEventListener: (type: string, listener: (event: { data?: unknown }) => void) => void;
  close: () => void;
};

test("LocalBridgeServer accepts a browser WebSocket client", async (t) => {
  const WebSocketConstructor = getWebSocketConstructor();

  if (!WebSocketConstructor) {
    return;
  }

  const port = await getFreePort();
  const server = new LocalBridgeServer({
    port,
    token: "test-token",
    sessionId: "test-session"
  });
  await server.start();
  t.after(() => server.dispose());

  const message = await new Promise<BridgeEnvelope<PairAcceptedPayload>>((resolve, reject) => {
    const ws = new WebSocketConstructor(`ws://127.0.0.1:${port}/?token=test-token`);
    t.after(() => ws.close());
    ws.addEventListener("message", (event) => {
      resolve(JSON.parse(String(event.data)) as BridgeEnvelope<PairAcceptedPayload>);
    });
    ws.addEventListener("error", () => {
      reject(new Error("WebSocket connection failed."));
    });
  });

  assert.equal(message.type, "pair.accepted");
  assert.equal(message.sessionId, "test-session");
  assert.equal(message.payload.connectedClients, 1);
  assert.equal(server.getStatus().browserClients.length, 1);
});

test("LocalBridgeServer returns HTTP health without a browser client", async (t) => {
  if (!globalThis.fetch) {
    return;
  }

  const port = await getFreePort();
  const server = new LocalBridgeServer({
    port,
    token: "test-token",
    sessionId: "test-session"
  });
  await server.start();
  t.after(() => server.dispose());

  const response = await fetch(`http://127.0.0.1:${port}/health`);
  const status = await response.json() as {
    running: boolean;
    port: number;
    browserClients: unknown[];
  };

  assert.equal(response.status, 200);
  assert.deepEqual(status, {
    running: true,
    port,
    browserClients: []
  });
});

test("LocalBridgeServer dispatches token-protected HTTP prompts to browser clients", async (t) => {
  const WebSocketConstructor = getWebSocketConstructor();

  if (!WebSocketConstructor || !globalThis.fetch) {
    return;
  }

  const port = await getFreePort();
  const server = new LocalBridgeServer({
    port,
    token: "test-token",
    sessionId: "test-session"
  });
  await server.start();
  t.after(() => server.dispose());

  const promptMessage = await new Promise<BridgeEnvelope>((resolve, reject) => {
    const ws = new WebSocketConstructor(`ws://127.0.0.1:${port}/?token=test-token`);
    t.after(() => ws.close());

    ws.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data)) as BridgeEnvelope;

      if (message.type === "pair.accepted") {
        void fetch(`http://127.0.0.1:${port}/prompt`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-webchat-token": "test-token"
          },
          body: JSON.stringify({
            providerId: "gemini",
            chatUrl: "https://gemini.google.com/",
            prompt: "Create a tiny notes helper.",
            promptNumber: 1,
            expectedAction: "submit",
            autoSubmit: true
          })
        })
          .then(async (response) => {
            assert.equal(response.status, 200);
            const result = await response.json() as { sent: number };
            assert.equal(result.sent, 1);
          })
          .catch(reject);
        return;
      }

      resolve(message);
    });
    ws.addEventListener("error", () => {
      reject(new Error("WebSocket connection failed."));
    });
  });

  assert.equal(promptMessage.type, "chat.prompt");
  assert.deepEqual(promptMessage.payload, {
    providerId: "gemini",
    chatUrl: "https://gemini.google.com/",
    prompt: "Create a tiny notes helper.",
    promptNumber: 1,
    expectedAction: "submit",
    autoSubmit: true
  });
});

test("LocalBridgeServer queues browser prompts until a client connects", async (t) => {
  const WebSocketConstructor = getWebSocketConstructor();

  if (!WebSocketConstructor || !globalThis.fetch) {
    return;
  }

  const port = await getFreePort();
  const server = new LocalBridgeServer({
    port,
    token: "test-token",
    sessionId: "test-session"
  });
  await server.start();
  t.after(() => server.dispose());

  const response = await fetch(`http://127.0.0.1:${port}/prompt`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-webchat-token": "test-token"
    },
    body: JSON.stringify({
      providerId: "chatgpt",
      chatUrl: "https://chatgpt.com/",
      prompt: "Queued prompt",
      promptNumber: 2,
      expectedAction: "submit"
    })
  });
  const result = await response.json() as { sent: number };
  assert.equal(result.sent, 0);

  const promptMessage = await new Promise<BridgeEnvelope>((resolve, reject) => {
    const ws = new WebSocketConstructor(`ws://127.0.0.1:${port}/?token=test-token`);
    t.after(() => ws.close());

    ws.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data)) as BridgeEnvelope;

      if (message.type === "chat.prompt") {
        resolve(message);
      }
    });
    ws.addEventListener("error", () => {
      reject(new Error("WebSocket connection failed."));
    });
  });

  assert.equal(promptMessage.type, "chat.prompt");
  assert.deepEqual(promptMessage.payload, {
    providerId: "chatgpt",
    chatUrl: "https://chatgpt.com/",
    prompt: "Queued prompt",
    promptNumber: 2,
    expectedAction: "submit"
  });
});

function getWebSocketConstructor(): (new (url: string) => TestWebSocket) | undefined {
  return (globalThis as {
    WebSocket?: new (url: string) => TestWebSocket;
  }).WebSocket;
}

async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (typeof address === "object" && address) {
        const port = address.port;
        server.close(() => resolve(port));
      } else {
        server.close(() => reject(new Error("Unable to allocate a free port.")));
      }
    });
  });
}
