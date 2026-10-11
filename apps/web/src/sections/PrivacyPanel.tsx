import { useState } from "preact/hooks";
import { BRAND, EVENT_RETENTION_DAYS } from "@wkc/shared";
import { Button, Notice } from "@wkc/ui";
import {
  browserSignal,
  forgetThisDevice,
  googleConfigured,
  readChoices,
  saveChoices,
  type PrivacyChoices,
} from "../lib/consent.ts";
import { storedVisitorId } from "../lib/session.ts";

/**
 * The privacy notice and analytics preferences, opened from the footer. Choices apply at once
 * and are remembered in this browser only. See docs/analytics-privacy.md.
 */
export function PrivacyPanel() {
  const [choices, setChoices] = useState<PrivacyChoices>(readChoices);
  const [status, setStatus] = useState<"idle" | "working" | "deleted" | "unreachable">("idle");
  const signal = browserSignal();
  const update = (next: Partial<Omit<PrivacyChoices, "v">>) => setChoices(saveChoices(next));

  async function forget() {
    setStatus("working");
    const visitor = storedVisitorId();
    const erased = visitor ? await forgetThisDevice(visitor) : true;
    if (!visitor) update({ measurement: "off", google: "denied" });
    setChoices(readChoices());
    setStatus(erased ? "deleted" : "unreachable");
  }

  return (
    <div class="privacy-panel">
      <p>
        We count visits to make booking easier. We never record what you type into a form, your
        name, contact details, address or payment details, and we use no advertising trackers.
      </p>
      <h3>What we keep</h3>
      <ul>
        <li>
          Usage counts: the page and price you saw, how you found us (for example a flyer), the
          sections you reached, booking steps and the kind of any error. They are linked to a random
          id stored in this browser, not to your name, and deleted after {EVENT_RETENTION_DAYS}{" "}
          days.
        </li>
        <li>
          If you book or join the waitlist, the details you send are kept with that request so we
          can collect and return your knives.
        </li>
      </ul>

      <h3>Your choices</h3>
      <label class="privacy-toggle">
        <input
          type="checkbox"
          checked={choices.measurement === "on"}
          onChange={(e) =>
            update(
              e.currentTarget.checked
                ? { measurement: "on" }
                : { measurement: "off", google: "denied" },
            )
          }
        />
        <span>
          <strong>Usage counts</strong>
          Help us improve this site. Counts stay with Westfield Knife Care.
        </span>
      </label>
      {googleConfigured() && (
        <label class="privacy-toggle">
          <input
            type="checkbox"
            checked={choices.google === "granted" && !signal && choices.measurement === "on"}
            disabled={Boolean(signal) || choices.measurement === "off"}
            onChange={(e) => update({ google: e.currentTarget.checked ? "granted" : "denied" })}
          />
          <span>
            <strong>Google Analytics</strong>
            Off unless you turn it on. Google sets its own cookies when it is on.
          </span>
        </label>
      )}
      {signal && (
        <p class="muted">
          Your browser asks sites not to track or share (
          {signal === "gpc" ? "Global Privacy Control" : "Do Not Track"}), so third-party analytics
          stay off.
        </p>
      )}

      <div class="privacy-actions">
        <Button variant="secondary" disabled={status === "working"} onClick={forget}>
          Delete my analytics data
        </Button>
      </div>
      {status === "deleted" && (
        <Notice tone="success">
          Done. Usage counts from this browser were deleted, and counting is now off here.
        </Notice>
      )}
      {status === "unreachable" && (
        <Notice tone="error">
          We could not reach our server, so nothing was deleted there yet. Counting is now off in
          this browser. Please try again later, or email {BRAND.support_email}.
        </Notice>
      )}
      <p class="muted privacy-contact">
        Questions or requests about your data:{" "}
        <a href={`mailto:${BRAND.support_email}`}>{BRAND.support_email}</a>
      </p>
    </div>
  );
}
