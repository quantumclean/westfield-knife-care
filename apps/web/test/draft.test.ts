import { describe, expect, it } from "vitest";
import { DRAFT_KEY, clearDraft, emptyContact, loadDraft, saveDraft } from "../src/lib/draft.ts";

function memory() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
    data,
  };
}

describe("booking draft", () => {
  it("round-trips what the customer typed", () => {
    const store = memory();
    const contact = { ...emptyContact(), name: "Ada", zip: "07090" };
    saveDraft({ knives: 6, care_day: "2026-10-13", contact }, 1000, store);
    expect(loadDraft(2000, store)).toEqual({
      v: 1,
      knives: 6,
      care_day: "2026-10-13",
      contact,
      saved_at: 1000,
    });
  });

  it("expires after two hours and removes itself", () => {
    const store = memory();
    saveDraft({ knives: 4, care_day: "2026-10-13", contact: emptyContact() }, 0, store);
    expect(loadDraft(2 * 60 * 60 * 1000 + 1, store)).toBeNull();
    expect(store.data.has(DRAFT_KEY)).toBe(false);
  });

  it("ignores malformed or foreign data", () => {
    const store = memory();
    store.setItem(DRAFT_KEY, "{not json");
    expect(loadDraft(0, store)).toBeNull();
    store.setItem(DRAFT_KEY, JSON.stringify({ v: 2, saved_at: 0 }));
    expect(loadDraft(0, store)).toBeNull();
  });

  it("keeps only known string fields, trimmed to a sane length", () => {
    const store = memory();
    store.setItem(
      DRAFT_KEY,
      JSON.stringify({
        v: 1,
        saved_at: 0,
        knives: "lots",
        care_day: 5,
        contact: { name: "x".repeat(900), email: 42, evil: "<script>" },
      }),
    );
    const draft = loadDraft(0, store)!;
    expect(draft.knives).toBe(0);
    expect(draft.care_day).toBe("");
    expect(draft.contact.name).toHaveLength(500);
    expect(draft.contact.email).toBe("");
    expect(Object.keys(draft.contact)).not.toContain("evil");
  });

  it("clears", () => {
    const store = memory();
    saveDraft({ knives: 4, care_day: "", contact: emptyContact() }, 0, store);
    clearDraft(store);
    expect(loadDraft(0, store)).toBeNull();
  });
});
