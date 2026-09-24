import { GetParametersCommand, SSMClient } from "@aws-sdk/client-ssm";
import type { Secrets } from "./config.ts";

/**
 * Secrets live in SSM Parameter Store (SecureString), never in the repo or
 * Terraform state. Terraform creates the parameters; an operator sets the
 * values once with `aws ssm put-parameter`. Loaded once per Lambda cold start.
 */
export async function loadSecretsFromSsm(prefix: string): Promise<Secrets> {
  const client = new SSMClient({});
  const names = {
    stripe_secret_key: `${prefix}/stripe_secret_key`,
    stripe_webhook_secret: `${prefix}/stripe_webhook_secret`,
    admin_api_key: `${prefix}/admin_api_key`,
  } as const;
  const result = await client.send(
    new GetParametersCommand({ Names: Object.values(names), WithDecryption: true }),
  );
  const byName = new Map((result.Parameters ?? []).map((p) => [p.Name, p.Value]));
  const pick = (name: string) => {
    const value = byName.get(name);
    // "unset" is the placeholder Terraform writes before an operator sets the real value.
    return value && value !== "unset" ? value : undefined;
  };
  return {
    stripe_secret_key: pick(names.stripe_secret_key),
    stripe_webhook_secret: pick(names.stripe_webhook_secret),
    admin_api_key: pick(names.admin_api_key),
  };
}
