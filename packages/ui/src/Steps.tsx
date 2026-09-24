import { Icon, type IconName } from "./Icon.tsx";

export interface Step {
  step: number;
  title: string;
  body: string;
  icon: IconName;
}

export function Steps({ steps }: { steps: readonly Step[] }) {
  return (
    <ol class="steps">
      {steps.map((s) => (
        <li class="step" key={s.step}>
          <span class="step-number" aria-hidden="true">
            {s.step}
          </span>
          <Icon name={s.icon} class="step-icon" />
          <h3>{s.title}</h3>
          <p>{s.body}</p>
        </li>
      ))}
    </ol>
  );
}
