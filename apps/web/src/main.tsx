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
