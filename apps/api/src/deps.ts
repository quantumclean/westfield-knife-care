import type { Config } from "./config.ts";
import type { PaymentGateway } from "./payments/types.ts";
import type { Repository } from "./repo/types.ts";

/** Everything the app needs injected; tests swap in fakes. */
export interface Deps {
  config: Config;
  repo: Repository;
  payments: PaymentGateway;
  now: () => Date;
  newId: () => string;
  log: (message: string, fields?: Record<string, unknown>) => void;
}

export function newId(): string {
  return crypto.randomUUID();
}

export function jsonLog(message: string, fields: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ message, ...fields, at: new Date().toISOString() }));
}
