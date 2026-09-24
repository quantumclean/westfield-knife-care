import type { ComponentChildren } from "preact";

export interface CardProps {
  children: ComponentChildren;
  tone?: "default" | "primary" | "muted";
  class?: string;
}

export function Card({ children, tone = "default", class: className }: CardProps) {
  return (
    <div class={["card", `card-${tone}`, className].filter(Boolean).join(" ")}>{children}</div>
  );
}
