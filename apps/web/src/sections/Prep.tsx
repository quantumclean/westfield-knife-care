import { PREP } from "@wkc/shared";
import { Section } from "@wkc/ui";
import { READY_ART } from "../art/ready.ts";

/**
 * What to do before handing knives over, shown before booking so it is not first met on the
 * confirmation page. These are instructions for the customer, not claims about how the knives
 * are handled afterwards. Mail-in appears only as a preview: there is no shipping kit.
 */
export function Prep() {
  return (
    <Section id="prepare" title={PREP.title} subtitle={PREP.subtitle}>
      <ol class="prep-steps">
        {PREP.steps.map((step, i) => (
          <li class="prep-step" key={step.id}>
            <svg
              viewBox="0 0 48 48"
              aria-hidden="true"
              dangerouslySetInnerHTML={{ __html: READY_ART[step.id] }}
            />
            <span class="prep-num" aria-hidden="true">
              {i + 1}
            </span>
            <h3>{step.title}</h3>
            <p>{step.body}</p>
          </li>
        ))}
      </ol>
      <p class="prep-unsure">{PREP.unsure}</p>

      <div class="prep-notes">
        <div class="prep-note">
          <h3>{PREP.back_home.title}</h3>
          <p>{PREP.back_home.body}</p>
        </div>
        <div class="prep-note prep-note-soon">
          <h3>{PREP.mail_in.title}</h3>
          <p>{PREP.mail_in.body}</p>
        </div>
      </div>
    </Section>
  );
}
