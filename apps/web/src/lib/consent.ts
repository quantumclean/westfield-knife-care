import { ownerHashOf } from "@wkc/shared";
import { API_BASE } from "./api.ts";

/**
 * The visitor's analytics choices, kept in this browser only.
 *
 * - First-party usage counts (our own `/api/events`) are on unless the visitor turns them off.
 * - Google Analytics is off unless the visitor turns it on, the site has a measurement id,
 *   and the browser sends no Global Privacy Control or Do Not Track signal.
 * See docs/analytics-privacy.md for the reasoning.
 */
export interface PrivacyChoices {
  v: 1;
  measurement: "on" | "off";
  google: "granted" | "denied";
}

const KEY = "wkc.privacy";
export const PRIVACY_KEY = KEY;
const DEFAULTS: PrivacyChoices = { v: 1, measurement: "on", google: "denied" };
/** Browser keys that identify this device to our analytics; the price arm key is kept. */
const DEVICE_KEYS = ["wkc.visitor_id", "wkc.attribution", "wkc.analytics_key"] as const;
const DELETION_KEY = "wkc.analytics_key";
export const PRIVACY_CHANGED = "wkc:privacy-changed";
export const DEVICE_FORGOTTEN = "wkc:device-forgotten";

/** Used when localStorage is unavailable, so an opt-out still holds for this page. */
let memory: PrivacyChoices | undefined;

export function readChoices(): PrivacyChoices {
  if (memory) return { ...memory };
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<PrivacyChoices>;
    if (stored && stored.v === 1) {
      return {
        v: 1,
        measurement: stored.measurement === "off" ? "off" : "on",
        google: stored.google === "granted" ? "granted" : "denied",
      };
    }
  } catch {
    // Unreadable or blocked storage: fall back to the defaults.
  }
  return { ...DEFAULTS };
}

export function saveChoices(next: Partial<Omit<PrivacyChoices, "v">>): PrivacyChoices {
  const choices: PrivacyChoices = { ...readChoices(), ...next, v: 1 };
  try {
    localStorage.setItem(KEY, JSON.stringify(choices));
  } catch {
    // Blocked storage: the choice applies to this page load only.
    memory = choices;
  }
  try {
    window.dispatchEvent(new CustomEvent(PRIVACY_CHANGED, { detail: choices }));
  } catch {
    // No event support (tests, very old browsers): readers re-check on every event anyway.
  }
  return choices;
}

/** A browser-level "don't track/share" signal: Global Privacy Control, then Do Not Track. */
export function browserSignal(): "gpc" | "dnt" | null {
  const nav = (typeof navigator === "undefined" ? {} : navigator) as {
    globalPrivacyControl?: boolean;
    doNotTrack?: string | null;
  };
  if (nav.globalPrivacyControl === true) return "gpc";
  const dnt = nav.doNotTrack ?? (globalThis as { doNotTrack?: string }).doNotTrack;
  return dnt === "1" || dnt === "yes" ? "dnt" : null;
}

export function measurementAllowed(): boolean {
  return readChoices().measurement === "on";
}

export function googleConfigured(): boolean {
  return (
    Boolean(import.meta.env.VITE_GA4_MEASUREMENT_ID) &&
    import.meta.env.VITE_GA4_MANUAL_EVENTS_ONLY === "true"
  );
}

/** Google Analytics may run: configured, opted in, measuring at all, and no browser signal. */
export function googleAllowed(): boolean {
  const choices = readChoices();
  return (
    googleConfigured() &&
    choices.measurement === "on" &&
    choices.google === "granted" &&
    browserSignal() === null
  );
}

let pageKey: string | undefined;

function newDeletionKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** This browser's deletion key, created on first use. It never leaves the browser with events. */
export function deletionKey(): string | undefined {
  try {
    const stored = localStorage.getItem(DELETION_KEY);
    if (stored && /^[A-Za-z0-9_-]{43}$/.test(stored)) return stored;
    const key = newDeletionKey();
    localStorage.setItem(DELETION_KEY, key);
    return key;
  } catch {
    // No storage (or no crypto): a key for this page only, so its events stay consistent.
    try {
      return (pageKey ??= newDeletionKey());
    } catch {
      return undefined;
    }
  }
}

/** The hash events carry as proof of ownership, or undefined where hashing is unavailable. */
export async function deviceOwnerHash(): Promise<string | undefined> {
  try {
    const key = deletionKey();
    return key ? await ownerHashOf(key) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * "Delete my analytics data": ask the API to erase this browser's events (proving ownership
 * with the deletion key), forget this browser's ids and key, and stop measuring on this device.
 * Returns false if owned deletion cannot be confirmed; counting stops immediately and
 * the proof is retained for retry. Missing proof never counts as successful deletion.
 */
export async function forgetThisDevice(visitorId: string): Promise<boolean> {
  saveChoices({ measurement: "off", google: "denied" });
  let erased = false;
  const key = (() => {
    try {
      return localStorage.getItem(DELETION_KEY) ?? pageKey;
    } catch {
      return pageKey;
    }
  })();
  try {
    if (key) {
      const res = await fetch(`${API_BASE}/events/forget`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ visitor_id: visitorId, key }),
      });
      erased = res.status === 204;
    } else {
      erased = false; // Legacy/unowned records cannot be proven or erased from this browser.
    }
  } catch {
    erased = false;
  }
  saveChoices({ measurement: "off", google: "denied" });
  if (!erased) return false; // Keep the proof so a failed request can be retried.
  pageKey = undefined;
  for (const key of DEVICE_KEYS) {
    try {
      localStorage.removeItem(key);
    } catch {
      // ignore
    }
  }
  window.dispatchEvent(new CustomEvent(DEVICE_FORGOTTEN));
  return erased;
}
