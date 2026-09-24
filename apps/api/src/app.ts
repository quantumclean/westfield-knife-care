import { Hono } from "hono";
import { cors } from "hono/cors";
import { validateRegistry } from "@wkc/shared";
import type { Deps } from "./deps.ts";
import { adminRoutes } from "./routes/admin.ts";
import { publicRoutes } from "./routes/public.ts";
import { webhookRoutes } from "./routes/webhooks.ts";
import { NotFoundError, ValidationError } from "./services/errors.ts";

/**
 * Builds the HTTP app. Routes are mounted under `/api` so the same code
 * serves behind CloudFront (`/api/*` origin) and the Vite dev proxy.
 */
export function createApp(deps: Deps) {
  const problems = validateRegistry();
  if (problems.length > 0) {
    throw new Error(`Experiment registry is invalid: ${problems.join("; ")}`);
  }

  const app = new Hono();

  app.use(
    "/api/*",
    cors({
      origin: deps.config.cors_origins,
      allowMethods: ["GET", "POST", "PATCH", "OPTIONS"],
      allowHeaders: ["Content-Type", "X-Admin-Key"],
      maxAge: 600,
    }),
  );

  app.onError((error, c) => {
    if (error instanceof ValidationError)
      return c.json({ error: "invalid_request", issues: error.issues }, 400);
    if (error instanceof NotFoundError) return c.json({ error: "not_found" }, 404);
    deps.log("request.error", { path: c.req.path, message: error.message, stack: error.stack });
    return c.json({ error: "internal_error" }, 500);
  });

  app.notFound((c) => c.json({ error: "not_found" }, 404));

  app.route("/api", publicRoutes(deps));
  app.route("/api", webhookRoutes(deps));
  app.route("/api/admin", adminRoutes(deps));

  return app;
}
