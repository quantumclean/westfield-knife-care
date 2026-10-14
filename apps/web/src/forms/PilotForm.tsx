import { useRef, useState } from "preact/hooks";
import {
  CADENCES,
  INTEREST_ONLY_TOPICS,
  SERVICE_INTERESTS,
  createWaitlistSchema,
  type InterestOnlyTopic,
} from "@wkc/shared";
import { Button, Field, Input, Notice, Select, Textarea } from "@wkc/ui";
import { ApiError, api } from "../lib/api.ts";
import { EVENTS, formErrorProps, track } from "../lib/analytics.ts";
import { errorSummary, useFocusFirstInvalid } from "../lib/forms.ts";
import { sessionContext, type Session } from "../lib/session.ts";

const INTEREST_LABELS: Record<(typeof SERVICE_INTERESTS)[number], string> = {
  sharpening: "One-off sharpening",
  always_sharp: "Always Sharp swap program",
  both: "Both",
  mail_in: "Mail-in sharpening (interest only)",
  gift: "Gifts (interest only)",
};

const CADENCE_LABELS: Record<(typeof CADENCES)[number], string> = {
  weekly: "Weekly",
  biweekly: "Every two weeks",
  monthly: "Monthly",
  once: "Just once",
};

/** The Always Sharp form offers only what it always did; the interest-only forms fix their own values. */
const PILOT_INTERESTS = SERVICE_INTERESTS.filter(
  (v) => !(INTEREST_ONLY_TOPICS as readonly string[]).includes(v),
);
const PILOT_CADENCES = CADENCES.filter((v) => v !== "once");

/** Copy for the interest-only forms. Nothing is for sale: none of this may read like a purchase. */
const TOPIC_COPY: Record<InterestOnlyTopic, { intro: string; notesHint: string; done: string }> = {
  mail_in: {
    intro:
      "Mail-in is not available yet. There is no price, shipping method or start date, and we have no shipping kit, so please do not mail knives to us. Leave your details and we will email you if it opens.",
    notesHint: "Roughly how many knives, and the town you are in.",
    done: "We will email you if mail-in sharpening opens.",
  },
  gift: {
    intro:
      "Gifts are not on sale yet. A gift would pay for someone else's sharpening, and their knives would still go by local pickup or mail-in. Leave your details and we will email you if gifts open.",
    notesHint:
      "Optional: the occasion or timing you have in mind. Please do not enter your recipient's name or address.",
    done: "We will email you if gifts open.",
  },
};

/** What booking already knows, so the visitor does not type it twice. */
export interface WaitlistPrefill {
  notes: string;
  name?: string;
  email?: string;
  phone?: string;
  /** Set for the interest-only forms (mail-in, gift): fixes the interest and hides the rhythm. */
  interest?: InterestOnlyTopic;
}

export interface PilotFormProps {
  session: Session;
  /**
   * Set when the visitor arrives from booking (outside the service area, or
   * booking closed): the waitlist is for one-off sharpening, with a note.
   */
  prefill?: WaitlistPrefill;
}

export function PilotForm({ session, prefill }: PilotFormProps) {
  const topic = prefill?.interest;
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [errorsReportedAt, setErrorsReportedAt] = useState(0);
  const [failure, setFailure] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  useFocusFirstInvalid(formRef, errorsReportedAt);

  async function onSubmit(event: Event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget as HTMLFormElement);
    const value = (key: string) => String(form.get(key) ?? "").trim();
    const candidate = {
      ...sessionContext(session),
      name: value("name"),
      email: value("email"),
      phone: value("phone") || undefined,
      service_interest: topic ?? value("service_interest"),
      cadence: topic ? "once" : value("cadence"),
      notes: value("notes") || undefined,
    };
    const parsed = createWaitlistSchema.safeParse(candidate);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) next[issue.path.join(".")] ??= issue.message;
      setErrors(next);
      setErrorsReportedAt((n) => n + 1);
      track(EVENTS.form_error, formErrorProps("pilot", parsed.error.issues, candidate));
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
        {topic ? (
          <>
            <strong>You are on the list.</strong> {TOPIC_COPY[topic].done} Nothing has been charged,
            and there is nothing to pay.
          </>
        ) : prefill ? (
          <>
            <strong>You are on the list.</strong> Thanks for telling us where you are; routes expand
            based on demand.
          </>
        ) : (
          <>
            <strong>You are on the list.</strong> We will email you when the Always Sharp pilot
            opens in Westfield. Until then, you can still book a one-off sharpening.
          </>
        )}
      </Notice>
    );
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate>
      {topic ? (
        <div class="interest-note">
          <Notice>
            <strong>Interest only.</strong> Nothing is for sale yet and you will not be charged.
          </Notice>
          <p class="muted">{TOPIC_COPY[topic].intro}</p>
        </div>
      ) : prefill ? (
        <p class="muted">
          Leave your details and tell us where you are. Routes expand based on demand.
        </p>
      ) : (
        <p class="muted">
          Always Sharp is a swap program: hand us a dull knife, take a sharp one. Tell us what
          rhythm suits your kitchen and we will invite Westfield households first.
        </p>
      )}
      <Field label="Your name" htmlFor="pilot-name" required error={errors.name}>
        <Input
          id="pilot-name"
          name="name"
          autocomplete="name"
          defaultValue={prefill?.name}
          required
        />
      </Field>
      <div class="form-row">
        <Field label="Email" htmlFor="pilot-email" required error={errors.email}>
          <Input
            id="pilot-email"
            name="email"
            type="email"
            autocomplete="email"
            defaultValue={prefill?.email}
            required
          />
        </Field>
        <Field label="Phone (optional)" htmlFor="pilot-phone" error={errors.phone}>
          <Input
            id="pilot-phone"
            name="phone"
            type="tel"
            autocomplete="tel"
            defaultValue={prefill?.phone}
          />
        </Field>
      </div>
      {!topic && (
        <div class="form-row">
          <Field
            label="I'm interested in"
            htmlFor="pilot-interest"
            required
            error={errors.service_interest}
          >
            <Select id="pilot-interest" name="service_interest">
              {PILOT_INTERESTS.map((v) => (
                <option
                  value={v}
                  key={v}
                  selected={v === (prefill ? "sharpening" : "always_sharp")}
                >
                  {INTEREST_LABELS[v]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Preferred cadence" htmlFor="pilot-cadence" required error={errors.cadence}>
            <Select id="pilot-cadence" name="cadence">
              {PILOT_CADENCES.map((v) => (
                <option value={v} key={v} selected={v === "biweekly"}>
                  {CADENCE_LABELS[v]}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      )}
      <Field
        label="Anything we should know?"
        htmlFor="pilot-notes"
        error={errors.notes}
        hint={topic ? TOPIC_COPY[topic].notesHint : "Which knives, how many people you cook for."}
      >
        <Textarea id="pilot-notes" name="notes" defaultValue={prefill?.notes} />
      </Field>
      <p class="visually-hidden" role="status">
        {errorSummary(errors)}
      </p>
      {failure && <Notice tone="error">{failure}</Notice>}
      <div class="form-actions">
        <Button type="submit" size="lg" disabled={submitting} arrow>
          {submitting ? "Saving…" : topic ? "Tell us you are interested" : "Join the waitlist"}
        </Button>
      </div>
    </form>
  );
}
