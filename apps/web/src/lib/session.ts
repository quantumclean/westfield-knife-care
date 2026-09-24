import {
  deriveAttribution,
  resolveExperimentOrDefault,
  selectExperiment,
  type Attribution,
  type ResolvedExperiment,
} from "@wkc/shared";

/**
 * Everything about "who is looking" that orders, signups and events need:
 * a stable visitor id, the experiment they were assigned, and first-touch
 * attribution. Stored in localStorage so return visits stay consistent.
 */
export interface Session {
  visitor_id: string;
  experiment: ResolvedExperiment;
  attribution: Attribution;
}

const KEYS = {
  visitor: "wkc.visitor_id",
  experiment: "wkc.experiment_id",
  attribution: "wkc.attribution",
} as const;

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private mode or blocked storage: the session simply is not sticky.
  }
}

function newVisitorId(): string {
  return typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `v-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function loadSession(
  location: Location = window.location,
  referrer = document.referrer,
): Session {
  const params = new URLSearchParams(location.search);

  const visitor_id = read(KEYS.visitor) ?? newVisitorId();
  write(KEYS.visitor, visitor_id);

  const chosen = selectExperiment({
    requestedId: params.get("exp"),
    storedId: read(KEYS.experiment),
    visitorId: visitor_id,
  });
  const experiment = resolveExperimentOrDefault(chosen?.id);
  write(KEYS.experiment, experiment.experiment.id);

  // First touch wins unless the URL carries explicit campaign parameters.
  const explicit = params.has("src") || params.has("utm_source") || params.has("ch");
  const stored = read(KEYS.attribution);
  let attribution: Attribution | undefined;
  if (!explicit && stored) {
    try {
      attribution = JSON.parse(stored) as Attribution;
    } catch {
      attribution = undefined;
    }
  }
  attribution ??= deriveAttribution({
    src: params.get("src"),
    ch: params.get("ch"),
    utm_source: params.get("utm_source"),
    utm_medium: params.get("utm_medium"),
    referrer,
  });
  write(KEYS.attribution, JSON.stringify(attribution));

  return { visitor_id, experiment, attribution };
}

/** Fields every API call carries so the backend can attribute it. */
export function sessionContext(session: Session) {
  return {
    experiment_id: session.experiment.experiment.id,
    source: session.attribution.source,
    acquisition_channel: session.attribution.acquisition_channel,
    visitor_id: session.visitor_id,
  };
}
