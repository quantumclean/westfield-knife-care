import { HOW_IT_WORKS } from "@wkc/shared";
import { Section, Steps } from "@wkc/ui";

export function HowItWorks() {
  return (
    <Section id="how-it-works" title="How It Works" subtitle="Simple. Local. Convenient.">
      <Steps steps={HOW_IT_WORKS} />
    </Section>
  );
}
