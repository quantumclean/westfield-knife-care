import { createOrderSchema, type CreateOrderInput } from "@wkc/shared";

export const CHECKOUT_REQUEST_KEY = "wkc.booking.request";
type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;
interface Attempt {
  fingerprint: string;
  key: string;
}
let fallback: Attempt | undefined;

function store(): Store | null {
  try {
    // Shared across same-origin tabs so a second tab reuses the in-flight booking intent.
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Save before POST. Reuse across errors, reloads and cancelled Checkout returns. */
export async function checkoutRequestKey(
  input: CreateOrderInput,
  storage: Store | null = store(),
): Promise<string> {
  const normalized = createOrderSchema.safeParse(input);
  const bytes = new TextEncoder().encode(
    JSON.stringify(normalized.success ? normalized.data : input),
  );
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  const fingerprint = Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join(
    "",
  );
  let previous = fallback;
  try {
    const value = JSON.parse(storage?.getItem(CHECKOUT_REQUEST_KEY) ?? "null") as Attempt | null;
    if (
      value &&
      /^[a-f0-9]{64}$/.test(value.fingerprint) &&
      /^[A-Za-z0-9_-]{16,128}$/.test(value.key)
    )
      previous = value;
  } catch {
    /* Storage may be blocked or corrupt. Keep the in-memory attempt. */
  }
  const attempt =
    previous?.fingerprint === fingerprint ? previous : { fingerprint, key: crypto.randomUUID() };
  fallback = attempt;
  try {
    storage?.setItem(CHECKOUT_REQUEST_KEY, JSON.stringify(attempt));
  } catch {
    /* Tab memory remains usable. */
  }
  return attempt.key;
}

export function clearCheckoutRequest(storage: Store | null = store()): void {
  fallback = undefined;
  try {
    storage?.removeItem(CHECKOUT_REQUEST_KEY);
  } catch {
    /* ignore */
  }
}
