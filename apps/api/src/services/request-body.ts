type ReadResult<T> =
  | { ok: true; value: T }
  | { ok: false; status: 400 | 413; error: "invalid_request" | "payload_too_large" };

/** Read a request through a byte cap, even when Content-Length is absent or incorrect. */
export async function readTextBody(
  request: Request,
  maxBytes: number,
): Promise<ReadResult<string>> {
  const declared = request.headers.get("content-length");
  if (declared && /^\d+$/.test(declared) && Number(declared) > maxBytes) {
    return { ok: false, status: 413, error: "payload_too_large" };
  }

  if (!request.body) return { ok: false, status: 400, error: "invalid_request" };
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        void reader.cancel().catch(() => {});
        return { ok: false, status: 413, error: "payload_too_large" };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, status: 400, error: "invalid_request" };
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return { ok: true, value: new TextDecoder("utf-8", { fatal: true }).decode(bytes) };
  } catch {
    return { ok: false, status: 400, error: "invalid_request" };
  }
}

export async function readJsonBody(
  request: Request,
  maxBytes: number,
): Promise<ReadResult<unknown>> {
  const text = await readTextBody(request, maxBytes);
  if (!text.ok) return text;
  try {
    return { ok: true, value: JSON.parse(text.value) };
  } catch {
    return { ok: false, status: 400, error: "invalid_request" };
  }
}

export const BODY_LIMITS = {
  order: 16 * 1024,
  waitlist: 16 * 1024,
  event: 4 * 1024,
  feedback: 4 * 1024,
  adminPatch: 16 * 1024,
  webhook: 2 * 1024 * 1024,
} as const;
