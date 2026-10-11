import type { ComponentChildren } from "preact";
import { HOW_IT_WORKS } from "@wkc/shared";
import { Section } from "@wkc/ui";
import { STEP_ART } from "../art/steps.ts";

/**
 * Three stops on one stitched route (pickup, sharpen, return), each on its
 * own warm card, followed by whatever the page puts underneath: the film.
 */
export function HowItWorks({ children }: { children?: ComponentChildren }) {
  return (
    <Section
      id="how-it-works"
      title="From your kitchen. Back to your kitchen."
      subtitle="Three simple steps. A local helping hand."
    >
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
      {children}
    </Section>
  );
}
