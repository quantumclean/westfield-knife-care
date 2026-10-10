import { HOW_IT_WORKS } from "@wkc/shared";
import { Section } from "@wkc/ui";
import { STEP_ART } from "../art/steps.ts";

/** Three stamped stops on one stitched route: pickup, sharpen, return. */
export function HowItWorks() {
  return (
    <Section id="how-it-works" title="How it works" subtitle="Simple. Local. Convenient.">
      <ol class="route">
        {HOW_IT_WORKS.map((s) => (
          <li class="route-stop" key={s.step}>
            <span class="route-art" aria-hidden="true">
              <svg
                viewBox="0 0 64 64"
                dangerouslySetInnerHTML={{ __html: STEP_ART[s.icon] ?? "" }}
              />
            </span>
            <span class="stamp route-num" aria-hidden="true">
              Step {s.step}
            </span>
            <h3>{s.title}</h3>
            <p>{s.body}</p>
          </li>
        ))}
      </ol>
    </Section>
  );
}
