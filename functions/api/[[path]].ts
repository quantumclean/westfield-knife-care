import { handlePagesApi, type PagesBindings } from "../../apps/api/src/cloudflare.ts";

/** The Pages project root is the repository root, not apps/web. */
interface PagesContext {
  request: Request;
  env: PagesBindings;
}
export const onRequest = (context: PagesContext): Promise<Response> =>
  handlePagesApi(context.request, context.env);
