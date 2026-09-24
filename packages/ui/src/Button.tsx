import type { ComponentChildren, JSX } from "preact";

export interface ButtonProps {
  children: ComponentChildren;
  variant?: "primary" | "secondary" | "ghost";
  size?: "md" | "lg";
  href?: string;
  type?: "button" | "submit";
  disabled?: boolean;
  onClick?: (event: JSX.TargetedMouseEvent<HTMLElement>) => void;
  arrow?: boolean;
  class?: string;
  "aria-label"?: string;
}

/** Primary call to action. Renders an anchor when `href` is given. */
export function Button({
  children,
  variant = "primary",
  size = "md",
  href,
  type = "button",
  disabled,
  onClick,
  arrow,
  class: className,
  ...rest
}: ButtonProps) {
  const classes = ["btn", `btn-${variant}`, `btn-${size}`, className].filter(Boolean).join(" ");
  const content = (
    <>
      <span>{children}</span>
      {arrow && (
        <span class="btn-arrow" aria-hidden="true">
          ›
        </span>
      )}
    </>
  );
  if (href) {
    return (
      <a class={classes} href={href} onClick={onClick} aria-label={rest["aria-label"]}>
        {content}
      </a>
    );
  }
  return (
    <button
      class={classes}
      type={type}
      disabled={disabled}
      onClick={onClick}
      aria-label={rest["aria-label"]}
    >
      {content}
    </button>
  );
}
