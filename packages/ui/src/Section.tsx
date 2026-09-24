import type { ComponentChildren } from "preact";

export interface SectionProps {
  id?: string;
  title?: string;
  subtitle?: string;
  children: ComponentChildren;
  tone?: "default" | "muted";
}

export function Section({ id, title, subtitle, children, tone = "default" }: SectionProps) {
  return (
    <section id={id} class={`section section-${tone}`}>
      <div class="container">
        {title && (
          <header class="section-header">
            <h2>{title}</h2>
            {subtitle && <p class="section-subtitle">{subtitle}</p>}
          </header>
        )}
        {children}
      </div>
    </section>
  );
}
