export interface Config {
  /** Public site origin used for Stripe redirects, e.g. https://sharp.example.com */
  site_url: string;
  /** Origins allowed to call the API cross-origin (local dev). */
  cors_origins: string[];
  stripe_secret_key?: string;
  stripe_webhook_secret?: string;
  admin_api_key?: string;
  table_name?: string;
  /** Environment label recorded in logs, e.g. "prod" or "local". */
  stage: string;
}

export interface Secrets {
  stripe_secret_key?: string;
  stripe_webhook_secret?: string;
  admin_api_key?: string;
}

export function configFromEnv(env: NodeJS.ProcessEnv, secrets: Secrets = {}): Config {
  const site_url = (env.SITE_URL ?? "http://localhost:5173").replace(/\/$/, "");
  const cors = env.CORS_ORIGINS ?? site_url;
  return {
    site_url,
    cors_origins: cors
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    stripe_secret_key: secrets.stripe_secret_key ?? blank(env.STRIPE_SECRET_KEY),
    stripe_webhook_secret: secrets.stripe_webhook_secret ?? blank(env.STRIPE_WEBHOOK_SECRET),
    admin_api_key: secrets.admin_api_key ?? blank(env.ADMIN_API_KEY),
    table_name: blank(env.TABLE_NAME),
    stage: env.STAGE ?? "local",
  };
}

function blank(value: string | undefined): string | undefined {
  return value && value.trim() ? value.trim() : undefined;
}
