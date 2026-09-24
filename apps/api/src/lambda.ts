import { handle } from "hono/aws-lambda";
import { createApp } from "./app.ts";
import { buildDeps } from "./bootstrap.ts";

// Dependencies (including secrets) are resolved once per cold start.
const appPromise = buildDeps().then(createApp);

export const handler = async (
  event: Parameters<ReturnType<typeof handle>>[0],
  context: Parameters<ReturnType<typeof handle>>[1],
) => {
  const app = await appPromise;
  return handle(app)(event, context);
};
