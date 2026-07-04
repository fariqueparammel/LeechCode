import { createHash, randomBytes } from "crypto";

const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const MAX_FRAME_LENGTH = 1024 * 1024 * 8;

export interface DecodedFrameResult {
  readonly messages: readonly string[];
  readonly remaining: Buffer;
  readonly closeRequested: boolean;
  readonly pongPayloads: readonly Buffer[];
}

export function createWebSocketAccept(secWebSocketKey: string): string {
  return createHash("sha1")
    .update(`${secWebSocketKey}${GUID}`)
    .digest("base64");
}

export function encodeTextFrame(text: string, options: { readonly mask?: boolean } = {}): Buffer {
  const payload = Buffer.from(text, "utf8");
  const mask = options.mask === true;
  const headerLength = payload.length < 126 ? 2 : payload.length <= 65535 ? 4 : 10;
  const maskLength = mask ? 4 : 0;
  const frame = Buffer.alloc(headerLength + maskLength + payload.length);

  frame[0] = 0x81;

  if (payload.length < 126) {
    frame[1] = payload.length | (mask ? 0x80 : 0);
  } else if (payload.length <= 65535) {
    frame[1] = 126 | (mask ? 0x80 : 0);
    frame.writeUInt16BE(payload.length, 2);
  } else {
    frame[1] = 127 | (mask ? 0x80 : 0);
    frame.writeBigUInt64BE(BigInt(payload.length), 2);
  }

  const payloadStart = headerLength + maskLength;

  if (!mask) {
    payload.copy(frame, payloadStart);
    return frame;
  }

  const maskingKey = randomBytes(4);
  maskingKey.copy(frame, headerLength);

  for (let index = 0; index < payload.length; index += 1) {
    frame[payloadStart + index] = payload[index] ^ maskingKey[index % 4];
  }

  return frame;
}

export function encodePongFrame(payload: Buffer): Buffer {
  const safePayload = payload.subarray(0, 125);
  return Buffer.concat([Buffer.from([0x8a, safePayload.length]), safePayload]);
}

export function encodePingFrame(payload: Buffer = Buffer.alloc(0)): Buffer {
  const safePayload = payload.subarray(0, 125);
  return Buffer.concat([Buffer.from([0x89, safePayload.length]), safePayload]);
}

export function decodeFrames(buffer: Buffer): DecodedFrameResult {
  const messages: string[] = [];
  const pongPayloads: Buffer[] = [];
  let offset = 0;
  let closeRequested = false;

  while (offset + 2 <= buffer.length) {
    const first = buffer[offset];
    const second = buffer[offset + 1];
    const opcode = first & 0x0f;
    const masked = (second & 0x80) !== 0;
    let payloadLength = second & 0x7f;
    let headerLength = 2;

    if (payloadLength === 126) {
      if (offset + 4 > buffer.length) {
        break;
      }
      payloadLength = buffer.readUInt16BE(offset + 2);
      headerLength = 4;
    } else if (payloadLength === 127) {
      if (offset + 10 > buffer.length) {
        break;
      }
      const bigLength = buffer.readBigUInt64BE(offset + 2);
      if (bigLength > BigInt(MAX_FRAME_LENGTH)) {
        throw new Error("WebSocket frame is too large.");
      }
      payloadLength = Number(bigLength);
      headerLength = 10;
    }

    if (payloadLength > MAX_FRAME_LENGTH) {
      throw new Error("WebSocket frame is too large.");
    }

    const maskLength = masked ? 4 : 0;
    const payloadStart = offset + headerLength + maskLength;
    const frameEnd = payloadStart + payloadLength;

    if (frameEnd > buffer.length) {
      break;
    }

    const payload = Buffer.from(buffer.subarray(payloadStart, frameEnd));

    if (masked) {
      const maskingKey = buffer.subarray(offset + headerLength, payloadStart);
      for (let index = 0; index < payload.length; index += 1) {
        payload[index] = payload[index] ^ maskingKey[index % 4];
      }
    }

    if (opcode === 0x1) {
      messages.push(payload.toString("utf8"));
    } else if (opcode === 0x8) {
      closeRequested = true;
    } else if (opcode === 0x9) {
      pongPayloads.push(payload);
    }

    offset = frameEnd;
  }

  return {
    messages,
    remaining: buffer.subarray(offset),
    closeRequested,
    pongPayloads
  };
}
