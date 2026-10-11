import type { AnalyticsEvent } from "@wkc/shared";
import type { EventCursor, Repository } from "../repo/types.ts";

/** Upper bound on events one report reads; beyond it the report says it is truncated. */
export const MAX_REPORT_EVENTS = 200_000;
const PAGE = 5000;

export interface EventWindow {
  since?: string;
  until?: string;
}

/**
 * Every unexpired event in the window, newest first, read page by page with a cursor so a
 * report never silently stops at the repository's per-call limit.
 */
export async function readEvents(
  repo: Repository,
  window: EventWindow,
  max: number = MAX_REPORT_EVENTS,
): Promise<{ events: AnalyticsEvent[]; truncated: boolean }> {
  const events: AnalyticsEvent[] = [];
  let before: EventCursor | undefined;
  for (;;) {
    const page = await repo.listEvents({ ...window, before, limit: PAGE });
    for (const event of page) {
      if (events.length >= max) return { events, truncated: true };
      events.push(event);
    }
    const last = page.at(-1);
    if (!last || page.length < PAGE) return { events, truncated: false };
    before = { created_at: last.created_at, id: last.id };
  }
}
