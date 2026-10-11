import { describe, expect, it } from "vitest";
import { PAYMENT_STATUSES } from "@wkc/shared";
import { describeUnpaidStatus } from "../src/lib/order-status.ts";

const EMAIL = "help@example.com";
const SUCCESS = /thank you|booked|confirmed your|success|paid in full/i;

describe("describeUnpaidStatus", () => {
  const unpaid = PAYMENT_STATUSES.filter((s) => s !== "paid" && s !== "pending");

  it("covers every backend status except the two the page renders itself", () => {
    expect(unpaid).toEqual(["failed", "expired", "refunded"]);
  });

  it.each([...unpaid, "disputed", "", "PAID"])("never sounds like success for %j", (status) => {
    const { heading, message } = describeUnpaidStatus(status, EMAIL);
    expect(`${heading} ${message}`).not.toMatch(SUCCESS);
  });

  it("does not describe a refunded payment as unpaid", () => {
    const { heading, message } = describeUnpaidStatus("refunded", EMAIL);
    expect(heading).toBe("Payment refunded");
    expect(message).toContain("refunded");
    expect(message).not.toMatch(/not paid/i);
  });

  it("says failed and expired checkouts did not make a booking", () => {
    for (const status of ["failed", "expired"]) {
      expect(describeUnpaidStatus(status, EMAIL).message).toContain("booking was not made");
    }
  });

  it("does not echo an unrecognised status to the customer", () => {
    const { heading, message } = describeUnpaidStatus("<b>disputed</b>", EMAIL);
    expect(`${heading} ${message}`).not.toContain("disputed");
    expect(heading).toBe("We could not confirm this booking");
  });

  it("always gives a way to get help", () => {
    for (const status of [...unpaid, "unknown"]) {
      expect(describeUnpaidStatus(status, EMAIL).message).toContain(EMAIL);
    }
  });
});

describe("stampFor", () => {
  it("labels every state in plain words and never echoes an unknown status", async () => {
    const { stampFor } = await import("../src/lib/order-status.ts");
    expect(stampFor("paid")).toBe("Booked");
    expect(stampFor("pending")).toBe("Confirming");
    expect(stampFor("failed")).toBe("Not booked");
    expect(stampFor("expired")).toBe("Not booked");
    expect(stampFor("weird_new_status")).toBe("Not booked");
  });
});
