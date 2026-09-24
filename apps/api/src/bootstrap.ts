import { configFromEnv, type Config } from "./config.ts";
import { jsonLog, newId, type Deps } from "./deps.ts";
import { FakePaymentGateway } from "./payments/fake.ts";
import { StripeGateway } from "./payments/stripe.ts";
import type { PaymentGateway } from "./payments/types.ts";
import { DynamoRepository } from "./repo/dynamo.ts";
import { MemoryRepository } from "./repo/memory.ts";
import type { Repository } from "./repo/types.ts";
import { loadSecretsFromSsm } from "./secrets.ts";

/** Wire real dependencies from the environment (Lambda and local server). */
export async function buildDeps(env: NodeJS.ProcessEnv = process.env): Promise<Deps> {
  const secrets = env.SSM_PARAMETER_PREFIX
    ? await loadSecretsFromSsm(env.SSM_PARAMETER_PREFIX)
    : {};
  const config = configFromEnv(env, secrets);
  return {
    config,
    repo: chooseRepository(config),
    payments: choosePayments(config),
    now: () => new Date(),
    newId,
    log: jsonLog,
  };
}

function chooseRepository(config: Config): Repository {
  if (config.table_name) return new DynamoRepository(config.table_name);
  jsonLog("repo.memory", { warning: "TABLE_NAME not set; data is not persisted" });
  return new MemoryRepository();
}

function choosePayments(config: Config): PaymentGateway {
  if (config.stripe_secret_key) {
    return new StripeGateway({
      secret_key: config.stripe_secret_key,
      webhook_secret: config.stripe_webhook_secret,
    });
  }
  jsonLog("payments.fake", { warning: "STRIPE_SECRET_KEY not set; checkout is simulated" });
  return new FakePaymentGateway();
}
