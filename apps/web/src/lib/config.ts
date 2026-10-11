import { useCallback, useEffect, useState } from "preact/hooks";
import { api } from "./api.ts";
import type { ConfigState } from "./booking.ts";

/**
 * GET /config, once per page: the hero's "next pickup" stamp and the booking
 * sheet share it, so opening the sheet never waits on a second request.
 */
export function useSiteConfig(): { state: ConfigState; retry: () => void } {
  const [state, setState] = useState<ConfigState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    api
      .config()
      .then((config) => {
        if (!cancelled) setState({ status: "ready", config });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { state, retry };
}
