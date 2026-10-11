import { render } from "preact";
import "@wkc/ui/styles.css";
import "./styles.css";
import { App } from "./app.tsx";
import { EVENTS, initAnalytics, track } from "./lib/analytics.ts";
import { loadSession } from "./lib/session.ts";

const session = loadSession();
document.documentElement.dataset.experiment = session.experiment.experiment.id;
initAnalytics(session);
track(EVENTS.page_view);

render(<App session={session} />, document.getElementById("app")!);

// Engagement measurement is not needed for the first paint: load it once the page is idle.
const startEngagement = () =>
  import("./lib/engagement.ts").then((m) => m.startEngagement()).catch(() => {});
if (typeof requestIdleCallback === "function")
  requestIdleCallback(startEngagement, { timeout: 3000 });
else setTimeout(startEngagement, 1500);
