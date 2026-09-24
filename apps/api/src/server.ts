import { serve } from "@hono/node-server";
import { createApp } from "./app.ts";
import { buildDeps } from "./bootstrap.ts";

const deps = await buildDeps();
const app = createApp(deps);
const port = Number(process.env.PORT ?? 8787);

serve({ fetch: app.fetch, port }, (info) => {
  deps.log("server.listening", { port: info.port, stage: deps.config.stage });
});
