/**
 * What the customer typed into the booking sheet, kept for this tab only.
 *
 * Stripe's cancel link brings them back to `/?cancelled=1`; without this the
 * page would say "pick up where you left off" over an empty form. Session
 * storage (not local storage) so it dies with the tab, it expires after two
 * hours, and the thank-you page clears it once a booking is paid.
 */
export const DRAFT_KEY = "wkc.booking.draft";
const MAX_AGE_MS = 2 * 60 * 60 * 1000;

export const CONTACT_FIELDS = [
  "name",
  "email",
  "phone",
  "line1",
  "line2",
  "city",
  "state",
  "zip",
  "notes",
] as const;
export type ContactField = (typeof CONTACT_FIELDS)[number];
export type Contact = Record<ContactField, string>;

export interface BookingDraft {
  v: 1;
  knives: number;
  care_day: string;
  contact: Contact;
  saved_at: number;
}

export function emptyContact(): Contact {
  return {
    name: "",
    email: "",
    phone: "",
    line1: "",
    line2: "",
    city: "Westfield",
    state: "NJ",
    zip: "",
    notes: "",
  };
}

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function store(): Store | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function loadDraft(now = Date.now(), storage: Store | null = store()): BookingDraft | null {
  try {
    const raw = storage?.getItem(DRAFT_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<BookingDraft>;
    if (value.v !== 1 || typeof value.saved_at !== "number" || now - value.saved_at > MAX_AGE_MS) {
      storage?.removeItem(DRAFT_KEY);
      return null;
    }
    const contact = emptyContact();
    for (const key of CONTACT_FIELDS) {
      const v = value.contact?.[key];
      if (typeof v === "string") contact[key] = v.slice(0, 500);
    }
    return {
      v: 1,
      knives: Number.isInteger(value.knives) ? (value.knives as number) : 0,
      care_day: typeof value.care_day === "string" ? value.care_day : "",
      contact,
      saved_at: value.saved_at,
    };
  } catch {
    return null;
  }
}

export function saveDraft(
  draft: Omit<BookingDraft, "v" | "saved_at">,
  now = Date.now(),
  storage: Store | null = store(),
): void {
  try {
    storage?.setItem(DRAFT_KEY, JSON.stringify({ v: 1, saved_at: now, ...draft }));
  } catch {
    // Storage full or blocked: the draft is a convenience, never required.
  }
}

export function clearDraft(storage: Store | null = store()): void {
  try {
    storage?.removeItem(DRAFT_KEY);
  } catch {
    // ignore
  }
}
