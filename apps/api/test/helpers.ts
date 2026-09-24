import { configFromEnv } from "../src/config.ts";
import { createApp } from "../src/app.ts";
import type { Deps } from "../src/deps.ts";
import { FakePaymentGateway } from "../src/payments/fake.ts";
import { MemoryRepository } from "../src/repo/memory.ts";

export const WEBHOOK_SECRET = "test-webhook-secret";
export const ADMIN_KEY = "test-admin-key";

export function makeDeps(overrides: Partial<Deps> = {}) {
  let counter = 0;
  const clock = { now: new Date("2026-09-24T15:00:00Z") };
  const deps: Deps = {
    config: configFromEnv({ SITE_URL: "https://sharp.example.com", ADMIN_API_KEY: ADMIN_KEY }),
    repo: new MemoryRepository(),
    payments: new FakePaymentGateway(WEBHOOK_SECRET),
    now: () => new Date(clock.now),
    newId: () => `id-${String(++counter).padStart(4, "0")}`,
    log: () => {},
    ...overrides,
  };
  return { deps, app: createApp(deps), clock };
}

export const validOrder = {
  experiment_id: "experiment-001",
  source: "flyer-v1-qr",
  acquisition_channel: "print",
  visitor_id: "visitor-00000001",
  customer: {
    name: "Ada Lovelace",
    email: "ada@example.com",
    phone: "555-010-2030",
    address: { line1: "1 Main St", city: "Westfield", state: "NJ", zip: "07090" },
  },
  number_of_knives: 4,
  care_day: "2026-09-26",
};

export function json(method: string, body: unknown, headers: Record<string, string> = {}) {
  return {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function readJson(res: Response): Promise<any> {
  return res.json();
}
