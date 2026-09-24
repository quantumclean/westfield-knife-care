import { FAQ } from "@wkc/shared";
import { Accordion, Section } from "@wkc/ui";
import { EVENTS, track } from "../lib/analytics.ts";

export function Faq() {
  return (
    <Section id="faq" title="Questions, answered">
      <Accordion items={FAQ} onOpen={(id) => track(EVENTS.faq_opened, { question: id })} />
    </Section>
  );
}
