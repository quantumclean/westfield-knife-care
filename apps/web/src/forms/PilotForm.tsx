import { useState } from "preact/hooks";
import { CADENCES, SERVICE_INTERESTS, createWaitlistSchema } from "@wkc/shared";
import { Button, Field, Input, Notice, Select, Textarea } from "@wkc/ui";
import { ApiError, api } from "../lib/api.ts";
import { EVENTS, track } from "../lib/analytics.ts";
import { sessionContext, type Session } from "../lib/session.ts";

const INTEREST_LABELS: Record<(typeof SERVICE_INTERESTS)[number], string> = {
  sharpening: "One-off sharpening",
  always_sharp: "Always Sharp swap program",
  both: "Both",
};

const CADENCE_LABELS: Record<(typeof CADENCES)[number], string> = {
  weekly: "Weekly",
  biweekly: "Every two weeks",
  monthly: "Monthly",
};

export function PilotForm({ session }: { session: Session }) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(event: Event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget as HTMLFormElement);
    const value = (key: string) => String(form.get(key) ?? "").trim();
    const parsed = createWaitlistSchema.safeParse({
      ...sessionContext(session),
      name: value("name"),
      email: value("email"),
      phone: value("phone") || undefined,
      service_interest: value("service_interest"),
      cadence: value("cadence"),
      notes: value("notes") || undefined,
    });
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) next[issue.path.join(".")] ??= issue.message;
      setErrors(next);
      track(EVENTS.form_error, { form: "pilot", fields: Object.keys(next).join(",") });
      return;
    }
    setErrors({});
    setFailure(null);
    setSubmitting(true);
    try {
      await api.joinWaitlist(parsed.data);
      track(EVENTS.pilot_submitted, {
        cadence: parsed.data.cadence,
        interest: parsed.data.service_interest,
      });
      setDone(true);
    } catch (error) {
      setFailure(
        error instanceof ApiError && error.issues.length
          ? error.issues.join(" ")
          : error instanceof Error
            ? error.message
            : "Something went wrong. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <Notice tone="success">
        <strong>You are on the list.</strong> We will email you when the Always Sharp pilot opens in
        Westfield. Until then, you can still book a one-off sharpening.
      </Notice>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <p class="muted">
        Always Sharp is a swap program: hand us a dull knife, take a sharp one. Tell us what rhythm
        suits your kitchen and we will invite Westfield households first.
      </p>
      <Field label="Your name" htmlFor="pilot-name" required error={errors.name}>
        <Input id="pilot-name" name="name" autocomplete="name" required />
      </Field>
      <div class="form-row">
        <Field label="Email" htmlFor="pilot-email" required error={errors.email}>
          <Input id="pilot-email" name="email" type="email" autocomplete="email" required />
        </Field>
        <Field label="Phone" htmlFor="pilot-phone" error={errors.phone}>
          <Input id="pilot-phone" name="phone" type="tel" autocomplete="tel" />
        </Field>
      </div>
      <div class="form-row">
        <Field
          label="I'm interested in"
          htmlFor="pilot-interest"
          required
          error={errors.service_interest}
        >
          <Select id="pilot-interest" name="service_interest">
            {SERVICE_INTERESTS.map((v) => (
              <option value={v} key={v} selected={v === "always_sharp"}>
                {INTEREST_LABELS[v]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Preferred cadence" htmlFor="pilot-cadence" required error={errors.cadence}>
          <Select id="pilot-cadence" name="cadence">
            {CADENCES.map((v) => (
              <option value={v} key={v} selected={v === "biweekly"}>
                {CADENCE_LABELS[v]}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field
        label="Anything we should know?"
        htmlFor="pilot-notes"
        error={errors.notes}
        hint="Which knives, how many people you cook for."
      >
        <Textarea id="pilot-notes" name="notes" />
      </Field>
      {failure && <Notice tone="error">{failure}</Notice>}
      <div class="form-actions">
        <Button type="submit" size="lg" disabled={submitting} arrow>
          {submitting ? "Saving…" : "Join the waitlist"}
        </Button>
      </div>
    </form>
  );
}
